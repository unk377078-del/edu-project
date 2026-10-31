/**
 * Exam Taking Controller (exam.js)
 * Timer logic, Question Navigation, DB-backed Answer Persistence, Auto-submit
 */

let attemptId = null;
let examData = null;
let questions = [];
let currentIndex = 0;
let savedAnswers = {}; // { questionId: 'A' | 'B' | ... }
let timerInterval = null;
let remainingSeconds = 0;
let isSubmitting = false;

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  attemptId = urlParams.get('id');

  if (!attemptId) {
    alert('معرف الامتحان غير صحيح');
    window.location.href = '/student.html';
    return;
  }

  const user = await requireAuth('student');
  if (!user) return;

  await loadAttemptData();

  // Navigation Button Handlers
  document.getElementById('btn-prev-q')?.addEventListener('click', () => {
    if (currentIndex > 0) {
      goToQuestion(currentIndex - 1);
    }
  });

  document.getElementById('btn-next-q')?.addEventListener('click', () => {
    if (currentIndex < questions.length - 1) {
      goToQuestion(currentIndex + 1);
    }
  });

  document.getElementById('btn-top-submit')?.addEventListener('click', openSubmitModal);
  document.getElementById('btn-final-submit')?.addEventListener('click', openSubmitModal);

  document.getElementById('confirm-submit-btn')?.addEventListener('click', () => {
    submitExam(false);
  });
});

/* ============================================================
   Load Attempt & Questions
   ============================================================ */
async function loadAttemptData() {
  showLoading('جاري تحميل أسئلة الامتحان والمؤقت السحابي...');
  try {
    const res = await api(`/api/attempts/${attemptId}`);
    const att = res.attempt;

    // If already submitted, redirect to results
    if (att.status !== 'in_progress') {
      window.location.href = `/result.html?id=${attemptId}`;
      return;
    }

    // If time is already up, auto-submit
    if (att.isTimeExpired) {
      showToast('انتهى وقت الامتحان! جاري التسليم التلقائي...', 'warning');
      await submitExam(true);
      return;
    }

    examData = att.exam;
    questions = att.questions || [];
    remainingSeconds = att.remainingSeconds || 0;

    document.getElementById('exam-title').textContent = examData.title;

    // Hydrate existing answers from server
    savedAnswers = {};
    questions.forEach((q) => {
      if (q.selectedAnswer) {
        savedAnswers[q.id] = q.selectedAnswer;
      }
    });

    renderProgressDots();
    renderQuestion(0);
    startTimer();
  } catch (err) {
    showToast(err.message || 'فشل تحميل الامتحان', 'error');
    setTimeout(() => {
      window.location.href = '/student.html';
    }, 2000);
  } finally {
    hideLoading();
  }
}

/* ============================================================
   Server-backed Countdown Timer
   ============================================================ */
function startTimer() {
  const timerDisplay = document.getElementById('timer-display');
  const timerBox = document.getElementById('timer-box');

  function updateDisplay() {
    timerDisplay.textContent = formatSecondsToHMS(remainingSeconds);

    // Warning styling when less than 5 minutes remain
    if (remainingSeconds <= 300) {
      timerBox.classList.remove('normal');
      timerBox.style.animation = 'pulse 1s infinite alternate';
    } else {
      timerBox.classList.add('normal');
    }

    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      showToast('انتهى الوقت المحدد! جاري تسليم الإجابات تلقائياً...', 'warning');
      submitExam(true);
    }
    remainingSeconds--;
  }

  updateDisplay();
  timerInterval = setInterval(updateDisplay, 1000);
}

/* ============================================================
   Render Progress Dots
   ============================================================ */
function renderProgressDots() {
  const container = document.getElementById('progress-dots-container');
  container.innerHTML = questions.map((q, idx) => {
    const isAnswered = Boolean(savedAnswers[q.id]);
    const isCurrent = idx === currentIndex;

    let classes = 'dot-btn';
    if (isAnswered) classes += ' answered';
    if (isCurrent) classes += ' current';

    return `
      <button
        type="button"
        class="${classes}"
        id="dot-btn-${idx}"
        onclick="goToQuestion(${idx})"
        title="سؤال ${idx + 1}"
      >
        ${idx + 1}
      </button>
    `;
  }).join('');
}

function updateProgressDots() {
  questions.forEach((q, idx) => {
    const dot = document.getElementById(`dot-btn-${idx}`);
    if (dot) {
      const isAnswered = Boolean(savedAnswers[q.id]);
      const isCurrent = idx === currentIndex;

      dot.className = 'dot-btn';
      if (isAnswered) dot.classList.add('answered');
      if (isCurrent) dot.classList.add('current');
    }
  });
}

/* ============================================================
   Render Current Question
   ============================================================ */
function goToQuestion(index) {
  if (index < 0 || index >= questions.length) return;
  currentIndex = index;
  renderQuestion(index);
  updateProgressDots();
}

function renderQuestion(index) {
  const q = questions[index];
  if (!q) return;

  document.getElementById('q-counter').textContent = `سؤال ${index + 1} من ${questions.length}`;
  document.getElementById('q-marks-badge').textContent = `${q.marks || 1} درجات`;
  document.getElementById('question-text').textContent = q.questionText;

  const currentSelected = savedAnswers[q.id] || null;

  const optionsList = [
    { key: 'A', text: q.optionA },
    { key: 'B', text: q.optionB },
  ];
  if (q.optionC) optionsList.push({ key: 'C', text: q.optionC });
  if (q.optionD) optionsList.push({ key: 'D', text: q.optionD });

  const optionsContainer = document.getElementById('options-container');
  optionsContainer.innerHTML = optionsList.map((opt) => {
    const isSelected = currentSelected === opt.key;
    return `
      <div
        class="option-card ${isSelected ? 'selected' : ''}"
        onclick="selectOption('${q.id}', '${opt.key}')"
      >
        <div class="option-circle">${opt.key}</div>
        <div class="option-text">${escapeHtml(opt.text)}</div>
      </div>
    `;
  }).join('');

  // Update navigation buttons
  const prevBtn = document.getElementById('btn-prev-q');
  const nextBtn = document.getElementById('btn-next-q');
  const submitBtn = document.getElementById('btn-final-submit');

  if (prevBtn) prevBtn.disabled = index === 0;

  if (index === questions.length - 1) {
    if (nextBtn) nextBtn.style.display = 'none';
    if (submitBtn) submitBtn.style.display = 'inline-flex';
  } else {
    if (nextBtn) nextBtn.style.display = 'inline-flex';
    if (submitBtn) submitBtn.style.display = 'none';
  }
}

/* ============================================================
   Save Answer to Cloud Database
   ============================================================ */
async function selectOption(questionId, optionKey) {
  if (isSubmitting) return;

  // Optimistic UI update
  savedAnswers[questionId] = optionKey;
  renderQuestion(currentIndex);
  updateProgressDots();

  try {
    const res = await api(`/api/attempts/${attemptId}/answers`, {
      method: 'POST',
      body: JSON.stringify({
        questionId,
        selectedAnswer: optionKey,
      }),
    });

    if (!res.ok) {
      showToast(res.error || 'فشل حفظ الإجابة سحابياً', 'error');
    }
  } catch (err) {
    console.error('Save answer error:', err);
    showToast('خطأ في الاتصال بالسحابة أثناء حفظ الإجابة', 'warning');
  }
}

/* ============================================================
   Submit Exam
   ============================================================ */
function openSubmitModal() {
  const answeredCount = Object.keys(savedAnswers).length;
  const unansweredCount = questions.length - answeredCount;

  const summaryText = document.getElementById('submit-summary-text');
  const warningBox = document.getElementById('unanswered-warning-box');

  summaryText.textContent = `لقد قمت بالإجابة على ${answeredCount} من أصل ${questions.length} سؤال.`;

  if (unansweredCount > 0) {
    warningBox.style.display = 'block';
    warningBox.textContent = `⚠️ تنبيه: لديك ${unansweredCount} سؤال لم تقم بالإجابة عليها بعد!`;
  } else {
    warningBox.style.display = 'none';
  }

  openModal('submit-confirm-modal');
}

async function submitExam(isAuto = false) {
  if (isSubmitting) return;
  isSubmitting = true;

  clearInterval(timerInterval);
  closeModal('submit-confirm-modal');

  showLoading(isAuto ? 'جاري التسليم التلقائي وحساب النتيجة...' : 'جاري مراجعة الإجابات وتسليم الامتحان...');

  try {
    const res = await api(`/api/attempts/${attemptId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ auto: isAuto }),
    });

    if (res.ok) {
      showToast('تم تسليم الامتحان وتصحيحه بنجاح!', 'success');
      setTimeout(() => {
        window.location.href = `/result.html?id=${attemptId}`;
      }, 700);
    } else {
      showToast(res.error || 'حدث خطأ أثناء تسليم الامتحان', 'error');
      isSubmitting = false;
      hideLoading();
    }
  } catch (err) {
    showToast(err.message || 'فشل التسليم، يرجى المحاولة مرة أخرى', 'error');
    isSubmitting = false;
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
