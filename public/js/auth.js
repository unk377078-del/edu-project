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

  const studentForm = document.getElementById('student-login-form');
  const studentNameInput = document.getElementById('student-name');
  const studentPhoneInput = document.getElementById('student-phone');
  const studentSubmitBtn = document.getElementById('student-submit-btn');

  function cleanPhone(val) {
    if (!val) return '';
    const trimmed = String(val).trim();
    // If it contains letters (like admin password 'admin123'), keep it as-is!
    if (/[a-zA-Z]/.test(trimmed)) {
      return trimmed;
    }
    // Otherwise normalize Arabic numbers and strip dashes/spaces
    return trimmed
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
      .replace(/[\s\-\+]/g, '');
  }

  if (studentForm) {
    studentForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = studentNameInput ? studentNameInput.value.trim() : '';
      const phone = cleanPhone(studentPhoneInput ? studentPhoneInput.value : '');

      if (!name) {
        showToast('يرجى إدخال اسمك', 'warning');
        studentNameInput?.focus();
        return;
      }

      if (!phone) {
        showToast('يرجى إدخال رقم الهاتف', 'warning');
        studentPhoneInput?.focus();
        return;
      }

      studentSubmitBtn.disabled = true;
      studentSubmitBtn.textContent = 'جاري التحقق والدخول...';
      showLoading('جاري التحقق من البيانات...');

      try {
        const response = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ name, phone }),
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
          showToast(response.error || 'بيانات الدخول غير صحيحة', 'error');
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
});
