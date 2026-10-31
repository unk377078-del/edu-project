/**
 * Login & Auth Controller (auth.js)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Check if already logged in
  try {
    const user = await getAuthUser();
    if (user) {
      if (user.role === 'admin') {
        window.location.href = '/admin.html';
        return;
      } else {
        window.location.href = '/student.html';
        return;
      }
    }
  } catch (err) {
    console.log('Not authenticated yet');
  }

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const submitBtn = document.getElementById('submit-btn');

  // Quick Demo Fill
  const demoAdminBtn = document.getElementById('demo-admin-btn');
  const demoStudentBtn = document.getElementById('demo-student-btn');

  if (demoAdminBtn) {
    demoAdminBtn.addEventListener('click', () => {
      emailInput.value = 'admin@exam.com';
      passwordInput.value = 'admin123';
      showToast('تم ملء بيانات حساب الأدمن', 'info');
    });
  }

  if (demoStudentBtn) {
    demoStudentBtn.addEventListener('click', () => {
      emailInput.value = 'student@exam.com';
      passwordInput.value = 'student123';
      showToast('تم ملء بيانات حساب الطالب', 'info');
    });
  }

  // Handle Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showToast('يرجى إدخال البريد الإلكتروني وكلمة المرور', 'warning');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري تسجيل الدخول...';
    showLoading('جاري التحقق من بيانات الحساب...');

    try {
      const response = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (response.ok && response.user) {
        showToast(`أهلاً بك، ${response.user.name}`, 'success');
        setTimeout(() => {
          if (response.user.role === 'admin') {
            window.location.href = '/admin.html';
          } else {
            window.location.href = '/student.html';
          }
        }, 600);
      } else {
        showToast(response.error || 'فشل تسجيل الدخول', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'تسجيل الدخول';
        hideLoading();
      }
    } catch (err) {
      showToast(err.message || 'حدث خطأ في الاتصال بالخادم', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'تسجيل الدخول';
      hideLoading();
    }
  });
});
