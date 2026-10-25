'use strict';
// Standalone world preview. Case gameplay, authentication and scores live in index.html.
// No storage access: previously saved learner drafts remain untouched and inert.
(() => {
  const $ = id => document.getElementById(id);
  const stations = {
    pharmacy: {
      name: 'เภสัชกร',
      title: 'พร้อมเข้าสู่เกมเภสัชกร',
      description: 'ไปหน้าเกมหลักเพื่อเข้าสู่ระบบ เลือกเคส และเล่นด้วยระบบคะแนนกับตารางอันดับ',
      available: true
    },
    patient: {
      name: 'ผู้ป่วย',
      title: 'สำรวจเส้นทางของคนไข้',
      description: 'ใช้ปุ่มส่งคนไข้ใต้ฉากเพื่อทดลองการเดิน หรือเปิดโหมดเดินชมอัตโนมัติ การสำรวจฉากไม่เปลี่ยนคะแนนของคุณ'
    },
    nurse: { name: 'พยาบาล', title: 'ยังไม่เปิดให้เล่น', description: 'บทบาทพยาบาลจะเพิ่มในอนาคต รุ่นนี้เปิดให้เล่นเฉพาะเภสัชกร' },
    doctor: { name: 'แพทย์', title: 'ยังไม่เปิดให้เล่น', description: 'บทบาทแพทย์จะเพิ่มในอนาคต รุ่นนี้เปิดให้เล่นเฉพาะเภสัชกร' },
    dentist: { name: 'ทันตแพทย์', title: 'ยังไม่เปิดให้เล่น', description: 'บทบาททันตแพทย์จะเพิ่มในอนาคต รุ่นนี้เปิดให้เล่นเฉพาะเภสัชกร' }
  };
  function selectStation(name) {
    const station = stations[name];
    if (!station) return;
    document.querySelectorAll('[data-station]').forEach(button => {
      button.classList.toggle('selected', button.dataset.station === name);
      button.setAttribute('aria-pressed', String(button.dataset.station === name));
    });
    window.HospitalScene?.selectStation(name);
    $('speaker').textContent = station.name;
    $('dialogue-title').textContent = station.title;
    $('dialogue-text').textContent = station.description;
    $('play-link').hidden = !station.available;
  }
  for (const [index, name] of ['pharmacy', 'patient', 'nurse', 'doctor', 'dentist'].entries()) {
    const station = stations[name];
    const button = document.createElement('button');
    button.className = 'mission';
    button.dataset.station = name;
    const number = document.createElement('span');
    number.className = 'number';
    number.textContent = String(index + 1).padStart(2, '0');
    const label = document.createElement('span');
    label.textContent = station.name;
    const status = document.createElement('small');
    status.textContent = station.available ? 'เปิดให้เล่น' : name === 'patient' ? 'ทดลองเส้นทางเดิน' : 'ยังไม่เปิดให้เล่น';
    label.append(status);
    button.append(number, label);
    $('missions').append(button);
  }
  document.querySelectorAll('[data-station]').forEach(button => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => selectStation(button.dataset.station));
  });
})();
