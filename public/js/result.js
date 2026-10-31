/**
 * Result Display Controller (result.js)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const attemptId = urlParams.get('id');

  if (!attemptId) {
    alert('معرف النتيجة غير موجود');
    window.location.href = '/login.html';
    return;
  }

  showLoading('جاري جلب تفاصيل النتيجة والدرجات...');
  try {
    const user = await getAuthUser();
    if (!user) {
      window.location.href = '/login.html';
      return;
    }

    // Set correct back link depending on role
    const backLink = document.getElementById('back-home-link');
    if (backLink) {
      backLink.href = user.role === 'admin' ? '/admin.html' : '/student.html';
      backLink.textContent = user.role === 'admin' ? '⬅️ العودة للوحة الأدمن' : '⬅️ العودة للوحة الطالب';
    }

    const res = await api(`/api/results/${attemptId}`);
    if (!res.ok) {
      showToast(res.error || 'تعذر عرض النتيجة', 'error');
      return;
    }

    renderResult(res.result);
  } catch (err) {
    showToast(err.message || 'فشل تحميل النتيجة', 'error');
  } finally {
    hideLoading();
  }
});

function renderResult(r) {
  const isPassed = r.isPassed;

  // Hero Card
  const heroCard = document.getElementById('result-hero');
  heroCard.className = `result-hero-card ${isPassed ? 'passed' : 'failed'}`;

  document.getElementById('res-exam-title').textContent = r.exam.title;
  document.getElementById('res-student-info').textContent = `الطالب: ${r.student.name} | كود الطالب: ${r.student.studentCode || '-'}${r.student.className ? ' | ' + r.student.className : ''}`;

  document.getElementById('res-score').textContent = `${r.score} / ${r.totalMarks}`;
  document.getElementById('res-percentage').textContent = `${r.percentage}%`;

  const statusBadge = document.getElementById('res-status-badge');
  statusBadge.className = `result-badge-status ${isPassed ? 'passed' : 'failed'}`;
  statusBadge.textContent = isPassed ? '🎉 تم اجتياز الامتحان بنجاح (ناجح)' : '❌ للأسف لم تجتز الامتحان (راسب)';

  // Stats Grid
  document.getElementById('stat-correct').textContent = r.correctCount;
  document.getElementById('stat-wrong').textContent = r.wrongCount;
  document.getElementById('stat-unanswered').textContent = r.unansweredCount;
  document.getElementById('stat-time-taken').textContent = formatSecondsToHMS(r.timeTakenSeconds);

  // Meta Banner
  document.getElementById('meta-start-time').textContent = formatDate(r.startedAt);
  document.getElementById('meta-submit-time').textContent = formatDate(r.submittedAt);
  document.getElementById('meta-passing-mark').textContent = `${r.passingMarks} درجات`;
  document.getElementById('meta-submit-type').textContent = r.status === 'auto_submitted' ? 'تسليم تلقائي (انتهاء الوقت)' : 'تسليم يدوي بواسطة الطالب';

  // Questions Review Section
  const reviewSection = document.getElementById('questions-review-section');
  const noReviewNotice = document.getElementById('no-review-notice');
  const reviewList = document.getElementById('questions-review-list');

  if (!r.showCorrectAnswers) {
    reviewSection.style.display = 'none';
    noReviewNotice.style.display = 'block';
    return;
  }

  reviewSection.style.display = 'block';
  noReviewNotice.style.display = 'none';

  reviewList.innerHTML = (r.questions || []).map((q, idx) => {
    let statusBadgeHtml = '';
    if (!q.isAnswered) {
      statusBadgeHtml = '<span class="badge badge-warning">لم يتم الإجابة</span>';
    } else if (q.isCorrect) {
      statusBadgeHtml = `<span class="badge badge-success">إجابة صحيحة (+${q.marks} درجات)</span>`;
    } else {
      statusBadgeHtml = '<span class="badge badge-danger">إجابة خاطئة (0 درجات)</span>';
    }

    return `
      <div class="review-question-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <span style="font-weight: 800; color: var(--primary);">سؤال ${idx + 1}</span>
          ${statusBadgeHtml}
        </div>

        <div style="font-size: 1.15rem; font-weight: 700; color: var(--gray-900); margin-bottom: 1rem;">
          ${escapeHtml(q.questionText)}
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${renderOption('A', q.optionA, q.selectedAnswer, q.correctAnswer)}
          ${renderOption('B', q.optionB, q.selectedAnswer, q.correctAnswer)}
          ${q.optionC ? renderOption('C', q.optionC, q.selectedAnswer, q.correctAnswer) : ''}
          ${q.optionD ? renderOption('D', q.optionD, q.selectedAnswer, q.correctAnswer) : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderOption(letter, text, selected, correct) {
  const isSelected = selected === letter;
  const isCorrect = correct === letter;

  let classes = 'review-option';
  let extraBadge = '';

  if (isCorrect) {
    classes += ' correct-answer';
    extraBadge = '<span class="badge badge-success" style="margin-right: auto;">الإجابة الصحيحة ✔️</span>';
  } else if (isSelected && !isCorrect) {
    classes += ' student-wrong';
    extraBadge = '<span class="badge badge-danger" style="margin-right: auto;">إجابتك الخاطئة ✖️</span>';
  }

  return `
    <div class="${classes}">
      <div class="option-circle" style="${isCorrect ? 'background: var(--success); color: #fff; border-color: var(--success);' : isSelected ? 'background: var(--danger); color: #fff; border-color: var(--danger);' : ''}">
        ${letter}
      </div>
      <span style="font-size: 1rem;">${escapeHtml(text)}</span>
      ${extraBadge}
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
