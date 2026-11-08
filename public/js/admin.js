/**
 * Admin Dashboard Controller (admin.js)
 */

let currentAdmin = null;
let currentActiveExamId = null;
let currentExamQuestions = [];
let allExamsList = [];

document.addEventListener('DOMContentLoaded', async () => {
  currentAdmin = await requireAuth('admin');
  if (!currentAdmin) return;

  // Set Profile info
  const nameEl = document.getElementById('admin-name');
  const emailBadge = document.getElementById('admin-email-badge');
  if (nameEl) nameEl.textContent = currentAdmin.name;
  if (emailBadge) emailBadge.textContent = currentAdmin.email;

  // Init Sidebar & Navigation
  initSidebarToggle();
  initTabNavigation();

  // Setup Logout
  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);

  // Load Initial Tab Data (Dashboard)
  loadDashboardStats();

  // Setup Exams Listeners
  initExamsSection();

  // Setup Students Listeners
  initStudentsSection();

  // Setup Results Listeners
  initResultsSection();

  // Setup JSON Import/Export
  initJsonSection();

  // Setup Settings Section
  initSettingsSection();
});

/* ============================================================
   Navigation Tabs
   ============================================================ */
function initTabNavigation() {
  const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('page-title');

  const titles = {
    dashboard: 'لوحة التحكم والإحصائيات',
    exams: 'إدارة الامتحانات وبنك الأسئلة',
    students: 'إدارة الطلاب والحسابات',
    results: 'سجل نتائج وتقييمات الطلاب',
    settings: 'إعدادات المنصة والدخول',
  };

  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      const tabId = link.getAttribute('data-tab');

      navLinks.forEach((l) => l.classList.remove('active'));
      link.classList.add('active');

      tabPanes.forEach((pane) => {
        pane.style.display = pane.id === `tab-${tabId}` ? 'block' : 'none';
      });

      if (pageTitle) pageTitle.textContent = titles[tabId] || 'لوحة التحكم';

      // Load specific data on tab switch
      if (tabId === 'dashboard') loadDashboardStats();
      if (tabId === 'exams') loadExams();
      if (tabId === 'students') loadStudents();
      if (tabId === 'results') loadResults();
      if (tabId === 'settings') loadAdminSettings();
    });
  });
}

/* ============================================================
   Section 1: Dashboard Stats
   ============================================================ */
async function loadDashboardStats() {
  try {
    const res = await api('/api/stats');
    if (!res.ok) return;

    const s = res.stats;

    // 8 Stat Cards
    document.getElementById('stat-students').textContent = s.studentsCount;
    document.getElementById('stat-exams').textContent = s.examsCount;
    document.getElementById('stat-attempts').textContent = s.attemptsCount;
    document.getElementById('stat-avg-score').textContent = `${s.avgScore}%`;

    document.getElementById('stat-highest').textContent = s.highestScore;
    document.getElementById('stat-lowest').textContent = s.lowestScore;
    document.getElementById('stat-pass-rate').textContent = `${s.passRate}%`;
    document.getElementById('stat-fail-rate').textContent = `${s.failRate}%`;

    // Question Performance Table (Least successful first)
    const qTbody = document.getElementById('question-performance-tbody');
    const qCountBadge = document.getElementById('questions-analyzed-badge');

    if (qCountBadge) qCountBadge.textContent = `${s.questionPerformance?.length || 0} سؤال`;

    if (!s.questionPerformance || s.questionPerformance.length === 0) {
      qTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--gray-500); padding: 1.5rem;">لا توجد بيانات إجابات مسجلة بعد.</td></tr>';
    } else {
      qTbody.innerHTML = s.questionPerformance.map((q) => {
        const rate = q.successRate;
        const colorClass = rate >= 70 ? 'green' : rate >= 40 ? 'amber' : 'red';

        return `
          <tr>
            <td style="font-weight: 600; max-width: 320px; white-space: normal;">${escapeHtml(q.questionText)}</td>
            <td><span class="badge badge-gray">${escapeHtml(q.examTitle || '-')}</span></td>
            <td>${q.totalAttempts}</td>
            <td style="font-weight: 700; color: var(--success);">${q.correctCount}</td>
            <td>
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <div class="progress-container" style="flex: 1;">
                  <div class="progress-bar ${colorClass}" style="width: ${rate}%;"></div>
                </div>
                <span style="font-weight: 700; font-size: 0.85rem; min-width: 45px;">${rate}%</span>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    // Per-Exam Stats Table
    const eTbody = document.getElementById('exam-stats-tbody');
    if (!s.perExamStats || s.perExamStats.length === 0) {
      eTbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--gray-500); padding: 1.5rem;">لا توجد امتحانات مسجلة.</td></tr>';
    } else {
      eTbody.innerHTML = s.perExamStats.map((e) => `
        <tr>
          <td style="font-weight: 700;">${escapeHtml(e.title)}</td>
          <td>${escapeHtml(e.subject || '-')}</td>
          <td>${e.attemptsCount}</td>
          <td style="font-weight: 700;">${e.avgScore}</td>
          <td><span class="badge ${e.passRate >= 50 ? 'badge-success' : 'badge-danger'}">${e.passRate}%</span></td>
          <td style="color: var(--success); font-weight: 700;">${e.highestScore}</td>
          <td style="color: var(--danger); font-weight: 700;">${e.lowestScore}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    showToast(err.message || 'فشل تحميل بيانات الإحصائيات', 'error');
  }
}

/* ============================================================
   Section 2: Exams Management
   ============================================================ */
function initExamsSection() {
  const statusFilter = document.getElementById('exam-filter-status');
  statusFilter?.addEventListener('change', () => loadExams());

  document.getElementById('btn-create-exam')?.addEventListener('click', () => {
    document.getElementById('exam-form').reset();
    document.getElementById('exam-id').value = '';
    document.getElementById('exam-modal-title').textContent = 'إنشاء امتحان جديد';
    document.getElementById('exam-duration-input').value = '30';
    document.getElementById('exam-passing-input').value = '10';
    document.getElementById('exam-max-attempts-input').value = '1';
    document.getElementById('exam-show-result').checked = true;
    document.getElementById('exam-show-correct').checked = true;
    openModal('exam-modal');
  });

  // Save Exam Form
  document.getElementById('exam-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('exam-id').value;

    const body = {
      title: document.getElementById('exam-title-input').value.trim(),
      subject: document.getElementById('exam-subject-input').value.trim(),
      description: document.getElementById('exam-desc-input').value.trim(),
      durationMinutes: Number(document.getElementById('exam-duration-input').value),
      passingMarks: Number(document.getElementById('exam-passing-input').value),
      maxAttempts: Number(document.getElementById('exam-max-attempts-input').value),
      status: document.getElementById('exam-status-input').value,
      showResult: document.getElementById('exam-show-result').checked,
      showCorrectAnswers: document.getElementById('exam-show-correct').checked,
      randomQuestions: document.getElementById('exam-random-questions').checked,
      randomAnswers: document.getElementById('exam-random-answers').checked,
    };

    showLoading('جاري حفظ الامتحان...');
    try {
      if (id) {
        await api(`/api/exams/${id}`, { method: 'PUT', body: JSON.stringify(body) });
        showToast('تم تحديث الامتحان بنجاح', 'success');
      } else {
        await api('/api/exams', { method: 'POST', body: JSON.stringify(body) });
        showToast('تم إنشاء الامتحان بنجاح', 'success');
      }
      closeModal('exam-modal');
      loadExams();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
  });

  // PDF Upload Listener
  document.getElementById('pdf-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentActiveExamId) return;

    const formData = new FormData();
    formData.append('file', file);

    showLoading('جاري رفع ملف PDF إلى Supabase Storage...');
    try {
      await api(`/api/exams/${currentActiveExamId}/pdf`, {
        method: 'POST',
        body: formData,
      });
      showToast('تم رفع ملف PDF بنجاح', 'success');
      e.target.value = '';
      loadExamPdfs(currentActiveExamId);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
  });

  // Add Question Button
  document.getElementById('btn-add-question')?.addEventListener('click', () => {
    document.getElementById('question-form').reset();
    document.getElementById('q-id').value = '';
    document.getElementById('question-modal-title').textContent = 'إضافة سؤال جديد';
    document.getElementById('q-marks').value = '1';
    document.getElementById('q-correct').value = 'A';
    openModal('question-modal');
  });

  // Save Question Form
  document.getElementById('question-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentActiveExamId) return;

    const qid = document.getElementById('q-id').value;
    const body = {
      questionText: document.getElementById('q-text').value.trim(),
      optionA: document.getElementById('q-opt-a').value.trim(),
      optionB: document.getElementById('q-opt-b').value.trim(),
      optionC: document.getElementById('q-opt-c').value.trim() || null,
      optionD: document.getElementById('q-opt-d').value.trim() || null,
      correctAnswer: document.getElementById('q-correct').value,
      marks: Number(document.getElementById('q-marks').value),
    };

    showLoading('جاري حفظ السؤال...');
    try {
      if (qid) {
        await api(`/api/exams/${currentActiveExamId}/questions/${qid}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        showToast('تم تحديث السؤال بنجاح', 'success');
      } else {
        await api(`/api/exams/${currentActiveExamId}/questions`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        showToast('تمت إضافة السؤال بنجاح', 'success');
      }
      closeModal('question-modal');
      loadExamDetail(currentActiveExamId);
      loadExams();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
  });
}

async function loadExams() {
  const statusFilter = document.getElementById('exam-filter-status')?.value || 'all';
  const tbody = document.getElementById('exams-tbody');

  try {
    const res = await api(`/api/exams?status=${statusFilter}`);
    allExamsList = res.exams || [];

    if (allExamsList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--gray-500); padding: 2rem;">لا توجد امتحانات مطابقة. اضغط "➕ إنشاء امتحان جديد" للبدء.</td></tr>';
      return;
    }

    const statusBadges = {
      published: '<span class="badge badge-success">منشور</span>',
      draft: '<span class="badge badge-warning">مسودة</span>',
      closed: '<span class="badge badge-danger">مغلق</span>',
    };

    tbody.innerHTML = allExamsList.map((exam) => `
      <tr>
        <td style="font-weight: 700; color: var(--gray-900);">${escapeHtml(exam.title)}</td>
        <td>${escapeHtml(exam.subject || '-')}</td>
        <td><span class="badge badge-primary">${exam.questionsCount} سؤال</span></td>
        <td>${exam.durationMinutes} دقيقة</td>
        <td>${exam.passingMarks} درجة</td>
        <td>${statusBadges[exam.status] || exam.status}</td>
        <td>
          <div style="display: flex; gap: 0.35rem;">
            <button type="button" class="btn btn-sm btn-outline-primary" onclick="openExamDetail('${exam.id}')">
              ⚙️ التفاصيل والأسئلة
            </button>
            <button type="button" class="btn btn-sm btn-outline" onclick="editExam('${exam.id}')">
              ✏️
            </button>
            <button type="button" class="btn btn-sm btn-ghost" style="color: var(--danger);" onclick="deleteExam('${exam.id}', '${escapeHtml(exam.title)}')">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast(err.message || 'فشل تحميل الامتحانات', 'error');
  }
}

async function editExam(examId) {
  const exam = allExamsList.find((e) => e.id === examId);
  if (!exam) return;

  document.getElementById('exam-id').value = exam.id;
  document.getElementById('exam-modal-title').textContent = 'تعديل الامتحان';
  document.getElementById('exam-title-input').value = exam.title;
  document.getElementById('exam-subject-input').value = exam.subject || '';
  document.getElementById('exam-desc-input').value = exam.description || '';
  document.getElementById('exam-duration-input').value = exam.durationMinutes;
  document.getElementById('exam-passing-input').value = exam.passingMarks;
  document.getElementById('exam-max-attempts-input').value = exam.maxAttempts;
  document.getElementById('exam-status-input').value = exam.status;
  document.getElementById('exam-show-result').checked = exam.showResult;
  document.getElementById('exam-show-correct').checked = exam.showCorrectAnswers;
  document.getElementById('exam-random-questions').checked = exam.randomQuestions;
  document.getElementById('exam-random-answers').checked = exam.randomAnswers;

  openModal('exam-modal');
}

async function deleteExam(examId, title) {
  if (!confirm(`هل أنت متأكد من حذف امتحان "${title}"؟\nسيتم حذف جميع الأسئلة والمحاولات المرتبطة به نهائياً.`)) {
    return;
  }

  showLoading('جاري حذف الامتحان...');
  try {
    await api(`/api/exams/${examId}`, { method: 'DELETE' });
    showToast('تم حذف الامتحان بنجاح', 'success');
    loadExams();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

// Exam Detail & Question Management
async function openExamDetail(examId) {
  currentActiveExamId = examId;
  openModal('exam-detail-modal');
  loadExamDetail(examId);
  loadExamPdfs(examId);
}

async function loadExamDetail(examId) {
  try {
    const res = await api(`/api/exams/${examId}`);
    const exam = res.exam;

    document.getElementById('detail-modal-exam-title').textContent = exam.title;
    document.getElementById('detail-modal-exam-meta').textContent = `المادة: ${exam.subject || '-'} | المدة: ${exam.durationMinutes} دقيقة | درجة النجاح: ${exam.passingMarks}`;

    currentExamQuestions = exam.questions || [];
    document.getElementById('detail-questions-count').textContent = `${currentExamQuestions.length} سؤال`;

    renderDetailQuestionsList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderDetailQuestionsList() {
  const container = document.getElementById('detail-questions-list');
  if (currentExamQuestions.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--gray-500); padding: 1.5rem;">لا توجد أسئلة مضافة بعد. أضف أسئلة يدويًا أو عبر ملف PDF أو JSON.</p>';
    return;
  }

  container.innerHTML = currentExamQuestions.map((q, idx) => `
    <div style="background: #ffffff; border: 1px solid var(--gray-200); border-radius: var(--radius-md); padding: 1rem 1.25rem;">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem;">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
            <span style="font-weight: 800; color: var(--primary);">سؤال ${idx + 1}</span>
            <span class="badge badge-gray">${q.marks || 1} درجات</span>
            <span class="badge badge-success">الإجابة: (${q.correct_answer || q.correctAnswer})</span>
          </div>
          <div style="font-weight: 700; color: var(--gray-900); font-size: 1rem;">${escapeHtml(q.question_text || q.questionText)}</div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.5rem; margin-top: 0.75rem; font-size: 0.875rem;">
            <div style="padding: 0.35rem 0.65rem; background: var(--gray-50); border-radius: var(--radius-sm); border: 1px solid var(--gray-200);">
              <strong>(A):</strong> ${escapeHtml(q.option_a || q.optionA)}
            </div>
            <div style="padding: 0.35rem 0.65rem; background: var(--gray-50); border-radius: var(--radius-sm); border: 1px solid var(--gray-200);">
              <strong>(B):</strong> ${escapeHtml(q.option_b || q.optionB)}
            </div>
            ${(q.option_c || q.optionC) ? `
              <div style="padding: 0.35rem 0.65rem; background: var(--gray-50); border-radius: var(--radius-sm); border: 1px solid var(--gray-200);">
                <strong>(C):</strong> ${escapeHtml(q.option_c || q.optionC)}
              </div>
            ` : ''}
            ${(q.option_d || q.optionD) ? `
              <div style="padding: 0.35rem 0.65rem; background: var(--gray-50); border-radius: var(--radius-sm); border: 1px solid var(--gray-200);">
                <strong>(D):</strong> ${escapeHtml(q.option_d || q.optionD)}
              </div>
            ` : ''}
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.35rem;">
          <div style="display: flex; gap: 0.25rem;">
            <button type="button" class="btn btn-sm btn-outline" title="تحريك لأعلى" onclick="moveQuestion(${idx}, -1)" ${idx === 0 ? 'disabled' : ''}>
              ▲
            </button>
            <button type="button" class="btn btn-sm btn-outline" title="تحريك لأسفل" onclick="moveQuestion(${idx}, 1)" ${idx === currentExamQuestions.length - 1 ? 'disabled' : ''}>
              ▼
            </button>
          </div>
          <div style="display: flex; gap: 0.25rem;">
            <button type="button" class="btn btn-sm btn-outline" onclick="editQuestion('${q.id}')">✏️</button>
            <button type="button" class="btn btn-sm btn-ghost" style="color: var(--danger);" onclick="deleteQuestion('${q.id}')">🗑️</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

async function moveQuestion(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= currentExamQuestions.length) return;

  const temp = currentExamQuestions[index];
  currentExamQuestions[index] = currentExamQuestions[newIndex];
  currentExamQuestions[newIndex] = temp;

  renderDetailQuestionsList();

  const orderIds = currentExamQuestions.map((q) => q.id);
  try {
    await api(`/api/exams/${currentActiveExamId}/questions/reorder`, {
      method: 'POST',
      body: JSON.stringify({ order: orderIds }),
    });
  } catch (err) {
    showToast('فشل حفظ الترتيب الجديد', 'error');
  }
}

function editQuestion(qid) {
  const q = currentExamQuestions.find((item) => item.id === qid);
  if (!q) return;

  document.getElementById('q-id').value = q.id;
  document.getElementById('question-modal-title').textContent = 'تعديل السؤال';
  document.getElementById('q-text').value = q.question_text || q.questionText;
  document.getElementById('q-opt-a').value = q.option_a || q.optionA;
  document.getElementById('q-opt-b').value = q.option_b || q.optionB;
  document.getElementById('q-opt-c').value = q.option_c || q.optionC || '';
  document.getElementById('q-opt-d').value = q.option_d || q.optionD || '';
  document.getElementById('q-correct').value = (q.correct_answer || q.correctAnswer || 'A').toUpperCase();
  document.getElementById('q-marks').value = q.marks || 1;

  openModal('question-modal');
}

async function deleteQuestion(qid) {
  if (!confirm('هل أنت متأكد من حذف هذا السؤال؟')) return;

  showLoading('جاري حذف السؤال...');
  try {
    await api(`/api/exams/${currentActiveExamId}/questions/${qid}`, { method: 'DELETE' });
    showToast('تم حذف السؤال بنجاح', 'success');
    loadExamDetail(currentActiveExamId);
    loadExams();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

// PDF Section Management
async function loadExamPdfs(examId) {
  const container = document.getElementById('pdf-list-container');
  try {
    const res = await api(`/api/exams/${examId}/pdf`);
    const pdfs = res.pdfs || [];

    if (pdfs.length === 0) {
      container.innerHTML = '<p style="font-size: 0.9rem; color: var(--gray-500); padding: 0.5rem 0;">لا توجد ملفات PDF مرفوعة لهذا الامتحان.</p>';
      return;
    }

    container.innerHTML = pdfs.map((pdf) => {
      const sizeKB = pdf.fileSize ? Math.round(pdf.fileSize / 1024) : 0;
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; background: #ffffff; padding: 0.75rem 1rem; border: 1px solid var(--gray-200); border-radius: var(--radius-md); margin-top: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 1.5rem;">📄</span>
            <div>
              <a href="/api/exams/${examId}/pdf/${pdf.id}/file" target="_blank" style="font-weight: 700; color: var(--primary);">
                ${escapeHtml(pdf.fileName)}
              </a>
              <div style="font-size: 0.8rem; color: var(--gray-500);">${sizeKB} KB - ${formatDate(pdf.uploadedAt)}</div>
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem;">
            <button type="button" class="btn btn-sm btn-primary" onclick="extractPdfQuestions('${pdf.id}', '${escapeHtml(pdf.fileName)}')">
              🤖 استخراج الأسئلة
            </button>
            <button type="button" class="btn btn-sm btn-ghost" style="color: var(--danger);" onclick="deletePdf('${pdf.id}')">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<p style="color: var(--danger); font-size: 0.9rem;">${err.message}</p>`;
  }
}

async function extractPdfQuestions(pdfId, fileName) {
  if (!confirm(`هل ترغب في بدء استخراج الأسئلة آلياً من ملف "${fileName}"؟`)) return;

  showLoading('جاري قراءة ملف PDF واستخراج الأسئلة بواسطة الذكاء الاصطناعي...');
  try {
    const res = await api(`/api/exams/${currentActiveExamId}/pdf/${pdfId}/extract`, { method: 'POST' });
    hideLoading();

    let msg = `تم استخراج وإضافة ${res.createdCount} سؤال بنجاح!`;
    if (res.warnings && res.warnings.length > 0) {
      msg += `\nتنبيهات:\n` + res.warnings.join('\n');
    }
    alert(msg);

    loadExamDetail(currentActiveExamId);
    loadExams();
  } catch (err) {
    hideLoading();
    showToast(err.message || 'فشل استخراج الأسئلة', 'error');
  }
}

async function deletePdf(pdfId) {
  if (!confirm('هل أنت متأكد من حذف هذا الملف من السحابة؟')) return;

  showLoading('جاري حذف الملف...');
  try {
    await api(`/api/exams/${currentActiveExamId}/pdf/${pdfId}`, { method: 'DELETE' });
    showToast('تم حذف الملف بنجاح', 'success');
    loadExamPdfs(currentActiveExamId);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

/* ============================================================
   JSON Import & Export
   ============================================================ */
function initJsonSection() {
  const jsonBtn = document.getElementById('btn-open-json-modal');
  const textarea = document.getElementById('json-textarea');
  const validBox = document.getElementById('json-validation-box');
  const loadTplBtn = document.getElementById('btn-load-json-template');
  const exportBtn = document.getElementById('btn-export-json');
  const submitImportBtn = document.getElementById('btn-submit-json-import');

  jsonBtn?.addEventListener('click', () => {
    textarea.value = '';
    validateJsonInput();
    openModal('json-modal');
  });

  // Sample JSON Template
  loadTplBtn?.addEventListener('click', () => {
    const sample = [
      {
        questionText: "ما هو حاصل ضرب 5 × 6؟",
        optionA: "20",
        optionB: "25",
        optionC: "30",
        optionD: "35",
        correctAnswer: "C",
        marks: 1
      },
      {
        questionText: "ما هي عاصمة جمهورية مصر العربية؟",
        optionA: "الإسكندرية",
        optionB: "القاهرة",
        optionC: "الجيزة",
        optionD: "أسوان",
        correctAnswer: "B",
        marks: 2
      }
    ];
    textarea.value = JSON.stringify(sample, null, 2);
    validateJsonInput();
  });

  // Export JSON
  exportBtn?.addEventListener('click', async () => {
    if (!currentActiveExamId) return;
    showLoading('جاري تصدير الأسئلة...');
    try {
      const res = await api(`/api/exams/${currentActiveExamId}/questions/export`);
      textarea.value = JSON.stringify(res, null, 2);
      validateJsonInput();
      showToast('تم تصدير الأسئلة إلى مربع النص', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
  });

  // Live Validation
  textarea?.addEventListener('input', validateJsonInput);

  function validateJsonInput() {
    const val = textarea.value.trim();
    if (!val) {
      validBox.style.background = 'var(--gray-100)';
      validBox.style.color = 'var(--gray-700)';
      validBox.textContent = 'الصق كود JSON لرؤية نتيجة الفحص الفوري.';
      return;
    }

    try {
      const parsed = JSON.parse(val);
      const arr = Array.isArray(parsed) ? parsed : (parsed.questions || []);

      if (!Array.isArray(arr) || arr.length === 0) {
        validBox.style.background = 'var(--warning-light)';
        validBox.style.color = 'var(--warning)';
        validBox.textContent = '⚠️ كود JSON صالح لكن لا يحتوي على قائمة أسئلة.';
        return;
      }

      let validCount = 0;
      let invalidCount = 0;

      arr.forEach((q) => {
        const text = q.questionText || q.question;
        const optA = q.optionA || q.A;
        const optB = q.optionB || q.B;
        const corr = String(q.correctAnswer || q.correct || q.answer || '').toUpperCase().trim();

        if (text && optA && optB && ['A', 'B', 'C', 'D'].includes(corr)) {
          validCount++;
        } else {
          invalidCount++;
        }
      });

      if (invalidCount === 0) {
        validBox.style.background = 'var(--success-light)';
        validBox.style.color = 'var(--success)';
        validBox.textContent = `✅ صيغة ممتازة: تم العثور على ${validCount} سؤال صالح جاهز للاستيراد.`;
      } else {
        validBox.style.background = 'var(--warning-light)';
        validBox.style.color = 'var(--warning)';
        validBox.textContent = `⚠️ تنبيه: ${validCount} سؤال صالح، و ${invalidCount} غير مكتمل الخيارات وسيتم تخطيه.`;
      }
    } catch (e) {
      validBox.style.background = 'var(--danger-light)';
      validBox.style.color = 'var(--danger)';
      validBox.textContent = `❌ خطأ في بناء كود JSON: ${e.message}`;
    }
  }

  // Submit Import
  submitImportBtn?.addEventListener('click', async () => {
    if (!currentActiveExamId) return;
    const val = textarea.value.trim();
    if (!val) {
      showToast('يرجى لصق بيانات JSON أولاً', 'warning');
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(val);
    } catch {
      showToast('صيغة JSON غير صحيحة', 'error');
      return;
    }

    const isReplace = document.getElementById('json-replace-mode').checked;

    showLoading('جاري استيراد الأسئلة...');
    try {
      const res = await api(`/api/exams/${currentActiveExamId}/questions/import?replace=${isReplace}`, {
        method: 'POST',
        body: JSON.stringify(parsed),
      });

      showToast(`تم استيراد ${res.count} سؤال بنجاح!`, 'success');
      closeModal('json-modal');
      loadExamDetail(currentActiveExamId);
      loadExams();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
  });
}

/* ============================================================
   Section 3: Students Management
   ============================================================ */
function initStudentsSection() {
  const searchInput = document.getElementById('student-search-input');
  const statusSelect = document.getElementById('student-filter-status');

  let debounceTimer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadStudents, 300);
  });
  statusSelect?.addEventListener('change', () => loadStudents());

  // Add Student Button
  document.getElementById('btn-add-student')?.addEventListener('click', () => {
    document.getElementById('student-form').reset();
    document.getElementById('student-id').value = '';
    document.getElementById('student-modal-title').textContent = 'إضافة طالب جديد';
    document.getElementById('pass-hint').textContent = '(مطلوبة في الإنشاء)';
    document.getElementById('student-password').required = true;
    openModal('student-modal');
  });

  // Save Student Form
  document.getElementById('student-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('student-id').value;

    const body = {
      name: document.getElementById('student-name').value.trim(),
      studentCode: document.getElementById('student-code').value.trim(),
      className: document.getElementById('student-class').value.trim(),
      email: document.getElementById('student-email').value.trim(),
      password: document.getElementById('student-password').value,
      status: document.getElementById('student-status').value,
    };

    showLoading('جاري حفظ بيانات الطالب...');
    try {
      if (id) {
        await api(`/api/students/${id}`, { method: 'PUT', body: JSON.stringify(body) });
        showToast('تم تحديث بيانات الطالب بنجاح', 'success');
      } else {
        await api('/api/students', { method: 'POST', body: JSON.stringify(body) });
        showToast('تمت إضافة الطالب بنجاح', 'success');
      }
      closeModal('student-modal');
      loadStudents();
      loadDashboardStats();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      hideLoading();
    }
  });
}

async function loadStudents() {
  const search = document.getElementById('student-search-input')?.value || '';
  const status = document.getElementById('student-filter-status')?.value || 'all';
  const tbody = document.getElementById('students-tbody');

  try {
    const res = await api(`/api/students?search=${encodeURIComponent(search)}&status=${status}`);
    const students = res.students || [];

    if (students.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--gray-500); padding: 2rem;">لا يوجد طلاب مطابقين للبحث.</td></tr>';
      return;
    }

    tbody.innerHTML = students.map((s) => `
      <tr>
        <td style="font-weight: 700; color: var(--gray-900);">${escapeHtml(s.name)}</td>
        <td><span class="badge badge-primary">${escapeHtml(s.studentCode)}</span></td>
        <td>${escapeHtml(s.email)}</td>
        <td>${escapeHtml(s.className || '-')}</td>
        <td>
          <span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}">
            ${s.status === 'active' ? 'نشط' : 'معطل'}
          </span>
        </td>
        <td style="font-size: 0.85rem; color: var(--gray-500);">${formatDate(s.createdAt)}</td>
        <td>
          <div style="display: flex; gap: 0.35rem;">
            <button type="button" class="btn btn-sm btn-outline" onclick="editStudent('${s.id}')">✏️</button>
            <button type="button" class="btn btn-sm btn-ghost" style="color: var(--danger);" onclick="deleteStudent('${s.id}', '${escapeHtml(s.name)}')">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast(err.message || 'فشل تحميل قائمة الطلاب', 'error');
  }
}

async function editStudent(studentId) {
  showLoading('جاري جلب بيانات الطالب...');
  try {
    const res = await api(`/api/students/${studentId}`);
    const s = res.student;

    document.getElementById('student-id').value = s.id;
    document.getElementById('student-modal-title').textContent = 'تعديل بيانات الطالب';
    document.getElementById('student-name').value = s.name;
    document.getElementById('student-code').value = s.studentCode;
    document.getElementById('student-class').value = s.className || '';
    document.getElementById('student-email').value = s.email;
    document.getElementById('student-password').value = '';
    document.getElementById('student-password').required = false;
    document.getElementById('pass-hint').textContent = '(اتركها فارغة إذا لم ترغب في التغيير)';
    document.getElementById('student-status').value = s.status || 'active';

    openModal('student-modal');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function deleteStudent(studentId, name) {
  if (!confirm(`هل أنت متأكد من حذف الطالب "${name}"؟\nسيتم حذف حسابه وكافة محاولاته وإجاباته نهائياً.`)) return;

  showLoading('جاري حذف الطالب...');
  try {
    await api(`/api/students/${studentId}`, { method: 'DELETE' });
    showToast('تم حذف الطالب بنجاح', 'success');
    loadStudents();
    loadDashboardStats();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

/* ============================================================
   Section 4: Results
   ============================================================ */
function initResultsSection() {
  const searchInput = document.getElementById('result-search-input');
  const examFilter = document.getElementById('result-filter-exam');
  const statusFilter = document.getElementById('result-filter-status');

  let debounceTimer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(loadResults, 300);
  });
  examFilter?.addEventListener('change', () => loadResults());
  statusFilter?.addEventListener('change', () => loadResults());
}

async function loadResults() {
  const search = document.getElementById('result-search-input')?.value || '';
  const examId = document.getElementById('result-filter-exam')?.value || 'all';
  const status = document.getElementById('result-filter-status')?.value || 'all';
  const tbody = document.getElementById('results-tbody');

  try {
    // Populate exams dropdown if empty
    const examSelect = document.getElementById('result-filter-exam');
    if (examSelect && examSelect.options.length <= 1) {
      const examsRes = await api('/api/exams?status=all');
      (examsRes.exams || []).forEach((e) => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.title;
        examSelect.appendChild(opt);
      });
    }

    const res = await api(`/api/results?search=${encodeURIComponent(search)}&examId=${examId}&status=${status}`);
    const results = res.results || [];

    if (results.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--gray-500); padding: 2rem;">لا توجد نتائج مسجلة حتى الآن.</td></tr>';
      return;
    }

    tbody.innerHTML = results.map((r) => `
      <tr>
        <td style="font-weight: 700;">${escapeHtml(r.studentName)}</td>
        <td><span class="badge badge-gray">${escapeHtml(r.studentCode)}</span></td>
        <td>${escapeHtml(r.examTitle)}</td>
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
          <button type="button" class="btn btn-sm btn-outline-primary" onclick="viewResultDetail('${r.id}')">
            👁️ عرض التفاصيل
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    showToast(err.message || 'فشل تحميل النتائج', 'error');
  }
}

async function viewResultDetail(attemptId) {
  showLoading('جاري جلب تفاصيل النتيجة...');
  try {
    const res = await api(`/api/results/${attemptId}`);
    const r = res.result;

    const modalBody = document.getElementById('res-detail-body');
    const isPassed = r.isPassed;

    modalBody.innerHTML = `
      <div style="background: #fafafa; border-radius: var(--radius-md); padding: 1.25rem; border: 1px solid var(--gray-200); margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
        <div>
          <h4 style="font-size: 1.15rem; font-weight: 800; color: var(--gray-900);">${escapeHtml(r.student.name)}</h4>
          <div style="font-size: 0.85rem; color: var(--gray-500);">كود الطالب: ${escapeHtml(r.student.studentCode)} | الصف: ${escapeHtml(r.student.className || '-')} | البريد: ${escapeHtml(r.student.email)}</div>
          <div style="font-size: 0.85rem; color: var(--primary); font-weight: 700; margin-top: 0.35rem;">الامتحان: ${escapeHtml(r.exam.title)}</div>
        </div>

        <div style="text-align: center;">
          <div style="font-size: 2.25rem; font-weight: 900; color: ${isPassed ? 'var(--success)' : 'var(--danger)'};">
            ${r.score} / ${r.totalMarks}
          </div>
          <span class="badge ${isPassed ? 'badge-success' : 'badge-danger'}" style="font-size: 0.9rem; padding: 0.35rem 0.85rem;">
            ${isPassed ? '✅ ناجح' : '❌ راسب'} (${r.percentage}%)
          </span>
        </div>
      </div>

      <div class="stat-grid" style="margin-bottom: 1.5rem;">
        <div class="stat-card" style="padding: 0.85rem 1rem;">
          <div class="stat-info"><span class="stat-value" style="font-size: 1.4rem; color: var(--success);">${r.correctCount}</span><span class="stat-label">صحيحة</span></div>
          <div class="stat-icon green" style="width: 38px; height: 38px; font-size: 1.1rem;">✅</div>
        </div>
        <div class="stat-card" style="padding: 0.85rem 1rem;">
          <div class="stat-info"><span class="stat-value" style="font-size: 1.4rem; color: var(--danger);">${r.wrongCount}</span><span class="stat-label">خاطئة</span></div>
          <div class="stat-icon red" style="width: 38px; height: 38px; font-size: 1.1rem;">❌</div>
        </div>
        <div class="stat-card" style="padding: 0.85rem 1rem;">
          <div class="stat-info"><span class="stat-value" style="font-size: 1.4rem; color: var(--warning);">${r.unansweredCount}</span><span class="stat-label">غير مجابة</span></div>
          <div class="stat-icon amber" style="width: 38px; height: 38px; font-size: 1.1rem;">⚠️</div>
        </div>
        <div class="stat-card" style="padding: 0.85rem 1rem;">
          <div class="stat-info"><span class="stat-value" style="font-size: 1.4rem;">${formatSecondsToHMS(r.timeTakenSeconds)}</span><span class="stat-label">الوقت المستغرق</span></div>
          <div class="stat-icon blue" style="width: 38px; height: 38px; font-size: 1.1rem;">⏱️</div>
        </div>
      </div>

      <h4 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 1rem; color: var(--gray-800);">تفاصيل الإجابات لكل سؤال:</h4>

      <div style="display: flex; flex-direction: column; gap: 1rem;">
        ${(r.questions || []).map((q, idx) => {
          let badgeStatus = '';
          if (!q.isAnswered) {
            badgeStatus = '<span class="badge badge-warning">لم يُجب عليه</span>';
          } else if (q.isCorrect) {
            badgeStatus = '<span class="badge badge-success">إجابة صحيحة (+ ' + q.marks + ' درجات)</span>';
          } else {
            badgeStatus = '<span class="badge badge-danger">إجابة خاطئة</span>';
          }

          return `
            <div style="background: #ffffff; border: 1px solid var(--gray-200); border-radius: var(--radius-md); padding: 1.25rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <span style="font-weight: 800; color: var(--primary);">سؤال ${idx + 1}</span>
                ${badgeStatus}
              </div>
              <div style="font-weight: 700; font-size: 1.05rem; margin-bottom: 0.75rem;">${escapeHtml(q.questionText)}</div>

              <div style="display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.9rem;">
                ${renderReviewOption('A', q.optionA, q.selectedAnswer, q.correctAnswer)}
                ${renderReviewOption('B', q.optionB, q.selectedAnswer, q.correctAnswer)}
                ${q.optionC ? renderReviewOption('C', q.optionC, q.selectedAnswer, q.correctAnswer) : ''}
                ${q.optionD ? renderReviewOption('D', q.optionD, q.selectedAnswer, q.correctAnswer) : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    openModal('result-detail-modal');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

function renderReviewOption(letter, text, selected, correct) {
  const isSelected = selected === letter;
  const isCorrect = correct === letter;

  let style = 'background: #ffffff; border: 1px solid var(--gray-200); color: var(--gray-700);';
  let badge = '';

  if (isCorrect) {
    style = 'background: var(--success-light); border: 1.5px solid var(--success); color: var(--success); font-weight: 700;';
    badge = ' <span class="badge badge-success" style="margin-right: auto;">الإجابة الصحيحة</span>';
  } else if (isSelected && !isCorrect) {
    style = 'background: var(--danger-light); border: 1.5px solid var(--danger); color: var(--danger); font-weight: 700;';
    badge = ' <span class="badge badge-danger" style="margin-right: auto;">إجابة الطالب الخاطئة</span>';
  }

  return `
    <div style="padding: 0.5rem 0.85rem; border-radius: var(--radius-sm); display: flex; align-items: center; gap: 0.5rem; ${style}">
      <span><strong>(${letter})</strong> ${escapeHtml(text)}</span>
      ${badge}
    </div>
  `;
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

/* ============================================================
   Platform Settings Section
   ============================================================ */
async function loadAdminSettings() {
  try {
    showLoading('جاري تحميل الإعدادات...');
    const res = await api('/api/settings');
    const toggle = document.getElementById('toggle-passwordless-setting');
    if (toggle && res.settings) {
      toggle.checked = Boolean(res.settings.allowPasswordlessLogin);
      updatePasswordlessToggleUI(toggle.checked);
    }
  } catch (err) {
    showToast(err.message || 'فشل تحميل الإعدادات', 'error');
  } finally {
    hideLoading();
  }
}

function updatePasswordlessToggleUI(isChecked) {
  const label = document.getElementById('passwordless-toggle-label');
  if (label) {
    if (isChecked) {
      label.textContent = 'مفعّل الآن 🟢';
      label.style.color = 'var(--success)';
    } else {
      label.textContent = 'معطّل ❌';
      label.style.color = 'var(--gray-500)';
    }
  }
}

function initSettingsSection() {
  const toggle = document.getElementById('toggle-passwordless-setting');
  const saveBtn = document.getElementById('btn-save-settings');

  if (toggle) {
    toggle.addEventListener('change', () => {
      updatePasswordlessToggleUI(toggle.checked);
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'جاري الحفظ...';
        const allowPasswordlessLogin = toggle ? toggle.checked : false;

        const res = await api('/api/settings', {
          method: 'POST',
          body: JSON.stringify({ allowPasswordlessLogin }),
        });

        if (res.ok) {
          showToast(
            allowPasswordlessLogin
              ? 'تم تفعيل دخول الطلاب بدون كلمة مرور بنجاح 🟢'
              : 'تم تعطيل دخول الطلاب بدون كلمة مرور ❌',
            'success'
          );
          const alertEl = document.getElementById('settings-save-alert');
          if (alertEl) {
            alertEl.style.display = 'block';
            setTimeout(() => {
              alertEl.style.display = 'none';
            }, 4000);
          }
        } else {
          showToast(res.error || 'فشل حفظ الإعدادات', 'error');
        }
      } catch (err) {
        showToast(err.message || 'حدث خطأ أثناء الحفظ', 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 حفظ التغييرات الآن';
      }
    });
  }
}
