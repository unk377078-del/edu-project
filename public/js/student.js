/**
 * Student Dashboard Controller (student.js)
 */

let currentStudent = null;
let publishedExams = [];
let studentResults = [];

document.addEventListener('DOMContentLoaded', async () => {
  currentStudent = await requireAuth('student');
  if (!currentStudent) return;

  // Set Profile Information
  document.getElementById('student-name').textContent = currentStudent.name;
  document.getElementById('student-code-role').textContent = `كود: ${currentStudent.studentCode || '-'}`;
  document.getElementById('student-class-badge').textContent = currentStudent.className || 'طالب';
  document.getElementById('welcome-name').textContent = `أهلاً بك، ${currentStudent.name} 👋`;
  document.getElementById('welcome-code').textContent = currentStudent.studentCode || '-';

  initSidebarToggle();
  initTabNavigation();

  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);

  // Load Initial Data
  await loadAllData();
});

/* ============================================================
   Navigation
   ============================================================ */
function initTabNavigation() {
  const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('page-title');

  const titles = {
    home: 'الصفحة الرئيسية',
    exams: 'الامتحانات المتاحة',
    results: 'سجل نتائجي',
  };

  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      const tabId = link.getAttribute('data-tab');
      goToTab(tabId);
    });
  });
}

function goToTab(tabId) {
  const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('page-title');

  const titles = {
    home: 'الصفحة الرئيسية',
    exams: 'الامتحانات المتاحة',
    results: 'سجل نتائجي',
  };

  navLinks.forEach((l) => {
    l.classList.toggle('active', l.getAttribute('data-tab') === tabId);
  });

  tabPanes.forEach((pane) => {
    pane.style.display = pane.id === `tab-${tabId}` ? 'block' : 'none';
  });

  if (pageTitle) pageTitle.textContent = titles[tabId] || 'بوابة الطالب';
}

/* ============================================================
   Load Exams & Results
   ============================================================ */
async function loadAllData() {
  showLoading('جاري تحديث بيانات الامتحانات والنتائج...');
  try {
    const [examsRes, resultsRes] = await Promise.all([
      api('/api/exams'),
      api('/api/results'),
    ]);

    publishedExams = examsRes.exams || [];
    studentResults = resultsRes.results || [];

    renderStats();
    renderExams();
    renderResults();
  } catch (err) {
    showToast(err.message || 'فشل جلب البيانات', 'error');
  } finally {
    hideLoading();
  }
}

function renderStats() {
  let passedCount = 0;
  let failedCount = 0;
  let totalPercent = 0;

  studentResults.forEach((r) => {
    if (r.isPassed) passedCount++;
    else failedCount++;
    totalPercent += Number(r.percentage || 0);
  });

  const avgPercent = studentResults.length > 0 ? (totalPercent / studentResults.length).toFixed(1) : 0;

  document.getElementById('home-stat-available').textContent = publishedExams.length;
  document.getElementById('home-stat-passed').textContent = passedCount;
  document.getElementById('home-stat-failed').textContent = failedCount;
  document.getElementById('home-stat-avg').textContent = `${avgPercent}%`;
}

function renderExams() {
  const homeContainer = document.getElementById('home-exams-list');
  const allContainer = document.getElementById('all-exams-list');

  if (publishedExams.length === 0) {
    const emptyHtml = '<p style="text-align: center; color: var(--gray-500); grid-column: 1/-1; padding: 2rem;">لا توجد امتحانات متاحة حالياً. تفقد المنصة لاحقاً.</p>';
    homeContainer.innerHTML = emptyHtml;
    allContainer.innerHTML = emptyHtml;
    return;
  }

  const examCardsHtml = publishedExams.map((exam) => {
    const isMaxReached = exam.isMaxReached;
    const hasInProgress = Boolean(exam.inProgressAttempt);
    const questionsCount = exam.questionsCount || 0;

    let actionButton = '';
    if (questionsCount === 0) {
      actionButton = `<button class="btn btn-outline btn-full" disabled>غير متاح حالياً</button>`;
    } else if (hasInProgress) {
      actionButton = `<button class="btn btn-warning btn-full" onclick="startExam('${exam.id}')">⚡ استئناف الامتحان المفتوح</button>`;
    } else if (isMaxReached) {
      actionButton = `<button class="btn btn-outline btn-full" disabled style="color: var(--danger);">تم استنفاد كل المحاولات (${exam.maxAttempts})</button>`;
    } else {
      actionButton = `<button class="btn btn-primary btn-full" onclick="startExam('${exam.id}')">🚀 بدء الامتحان الآن</button>`;
    }

    return `
      <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
            <span class="badge badge-primary">${escapeHtml(exam.subject || 'عام')}</span>
            <span class="badge badge-gray">⏱️ ${exam.durationMinutes} دقيقة</span>
          </div>

          <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--gray-900); margin-bottom: 0.5rem;">
            ${escapeHtml(exam.title)}
          </h3>

          <p style="font-size: 0.875rem; color: var(--gray-600); margin-bottom: 1rem; line-height: 1.5; min-height: 40px;">
            ${escapeHtml(exam.description || 'امتحان إلكتروني محدد المدة. اقرأ الأسئلة بعناية قبل الإجابة.')}
          </p>

          <div style="background: var(--gray-50); padding: 0.75rem; border-radius: var(--radius-md); font-size: 0.85rem; color: var(--gray-700); margin-bottom: 1.25rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
              <span>عدد الأسئلة:</span>
              <strong>${questionsCount} سؤال</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
              <span>درجة النجاح:</span>
              <strong>${exam.passingMarks} درجات</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>محاولاتك:</span>
              <strong>${exam.studentAttemptsCount} من ${exam.maxAttempts || 'غير محدود'}</strong>
            </div>
          </div>
        </div>

        <div>
          ${actionButton}
        </div>
      </div>
    `;
  }).join('');

  homeContainer.innerHTML = examCardsHtml;
  allContainer.innerHTML = examCardsHtml;
}

function renderResults() {
  const tbody = document.getElementById('student-results-tbody');

  if (studentResults.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--gray-500); padding: 2rem;">لم تقدم أي امتحانات بعد. ستظهر نتائجك هنا فور تسليمك للامتحانات.</td></tr>';
    return;
  }

  tbody.innerHTML = studentResults.map((r) => `
    <tr>
      <td style="font-weight: 700; color: var(--gray-900);">${escapeHtml(r.examTitle)}</td>
      <td>${escapeHtml(r.subject || '-')}</td>
      <td style="font-size: 0.85rem;">${formatDate(r.submittedAt)}</td>
      <td>${formatSecondsToHMS(r.timeTakenSeconds)}</td>
      <td style="font-weight: 800;">${r.score}</td>
      <td style="font-weight: 700;">${r.percentage}%</td>
      <td>
        <span class="badge ${r.isPassed ? 'badge-success' : 'badge-danger'}">
          ${r.isPassed ? 'ناجح' : 'راسب'}
        </span>
      </td>
      <td>
        <a href="/result.html?id=${r.id}" class="btn btn-sm btn-outline-primary">
          عرض النتيجة 📋
        </a>
      </td>
    </tr>
  `).join('');
}

async function startExam(examId) {
  if (!confirm('هل أنت مستعد لبدء الامتحان الآن؟ سيبدأ العد التنازلي للوقت فوراً.')) return;

  showLoading('جاري تجهيز الامتحان وبدء المحاولة في قاعدة البيانات...');
  try {
    const res = await api('/api/attempts', {
      method: 'POST',
      body: JSON.stringify({ examId }),
    });

    if (res.ok && res.attempt) {
      window.location.href = `/exam.html?id=${res.attempt.id}`;
    } else {
      showToast(res.error || 'فشل بدء الامتحان', 'error');
    }
  } catch (err) {
    showToast(err.message || 'حدث خطأ أثناء بدء الامتحان', 'error');
  } finally {
    hideLoading();
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
