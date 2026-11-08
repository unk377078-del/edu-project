/**
 * Login & Auth Controller (auth.js)
 * Primary Login: Student Name + Phone Number
 * Discrete Toggle: Admin Email + Password
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

  // 1. Student Login Form (Name + Phone Number)
  const studentForm = document.getElementById('student-login-form');
  const studentNameInput = document.getElementById('student-name');
  const studentPhoneInput = document.getElementById('student-phone');
  const studentSubmitBtn = document.getElementById('student-submit-btn');

  // Convert Arabic numbers (٠١٢٣٤٥٦٧٨٩) to standard English digits and remove spaces/dashes
  function cleanPhone(val) {
    if (!val) return '';
    return String(val)
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
      .replace(/[\s\-\+]/g, '')
      .trim();
  }

  if (studentForm) {
    studentForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = studentNameInput ? studentNameInput.value.trim() : '';
      const phone = cleanPhone(studentPhoneInput ? studentPhoneInput.value : '');

      if (!name || name.length < 2) {
        showToast('يرجى إدخال اسمك بالكامل (حرفين على الأقل)', 'warning');
        studentNameInput?.focus();
        return;
      }

      if (!phone || phone.length < 6) {
        showToast('يرجى إدخال رقم هاتف صحيح', 'warning');
        studentPhoneInput?.focus();
        return;
      }

      studentSubmitBtn.disabled = true;
      studentSubmitBtn.textContent = 'جاري تسجيل الدخول...';
      showLoading('جاري تسجيل دخول الطالب وتجهيز المنصة...');

      try {
        const response = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ name, phone }),
        });

        if (response.ok && response.user) {
          showToast(`أهلاً بك يا ${response.user.name}، بالتوفيق!`, 'success');
          setTimeout(() => {
            window.location.href = '/student.html';
          }, 600);
        } else {
          showToast(response.error || 'فشل تسجيل الدخول', 'error');
          studentSubmitBtn.disabled = false;
          studentSubmitBtn.textContent = '🚀 الدخول إلى منصة الامتحانات';
          hideLoading();
        }
      } catch (err) {
        showToast(err.message || 'حدث خطأ في الاتصال بالخادم', 'error');
        studentSubmitBtn.disabled = false;
        studentSubmitBtn.textContent = '🚀 الدخول إلى منصة الامتحانات';
        hideLoading();
      }
    });
  }

  // 2. Admin Login Toggle & Form
  const toggleAdminBtn = document.getElementById('toggle-admin-btn');
  const adminForm = document.getElementById('admin-login-form');
  const adminEmailInput = document.getElementById('admin-email');
  const adminPasswordInput = document.getElementById('admin-password');
  const adminSubmitBtn = document.getElementById('admin-submit-btn');

  if (toggleAdminBtn && adminForm) {
    toggleAdminBtn.addEventListener('click', () => {
      const isHidden = adminForm.style.display === 'none' || !adminForm.style.display;
      if (isHidden) {
        adminForm.style.display = 'block';
        toggleAdminBtn.textContent = '✖️ إخفاء نموذج الإدارة';
        adminEmailInput?.focus();
      } else {
        adminForm.style.display = 'none';
        toggleAdminBtn.textContent = '👑 تسجيل دخول المشرف / المعلم';
      }
    });
  }

  if (adminForm) {
    adminForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = adminEmailInput ? adminEmailInput.value.trim() : '';
      const password = adminPasswordInput ? adminPasswordInput.value : '';

      if (!email || !password) {
        showToast('يرجى إدخال البريد الإلكتروني وكلمة المرور', 'warning');
        return;
      }

      adminSubmitBtn.disabled = true;
      adminSubmitBtn.textContent = 'جاري التحقق...';
      showLoading('جاري التحقق من هوية المشرف...');

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
          showToast(response.error || 'بيانات غير صحيحة', 'error');
          adminSubmitBtn.disabled = false;
          adminSubmitBtn.textContent = 'دخول لوحة التحكم';
          hideLoading();
        }
      } catch (err) {
        showToast(err.message || 'حدث خطأ في الاتصال بالخادم', 'error');
        adminSubmitBtn.disabled = false;
        adminSubmitBtn.textContent = 'دخول لوحة التحكم';
        hideLoading();
      }
    });
  }
});
