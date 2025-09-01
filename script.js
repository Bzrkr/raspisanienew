const dayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const IPEauditories = ["502-2 к.", "601-2 к.", "603-2 к.", "604-2 к.", "605-2 к.", "607-2 к.", "611-2 к.", "613-2 к.", "615-2 к."];
const additionalAuditories = ["602-2 к."];

// Порядок временных интервалов для сортировки
const timeSlotsOrder = [
    "08:30—09:55",
    "10:05—11:30 ",
    "12:00—13:25",
    "13:35—15:00",
    "15:30—16:55",
    "17:05—18:30",
    "19:00—20:25",
    "20:35—22:00"
];

// Глобальные переменные для хранения данных
let currentWeekNumber = null;
let teachersData = null;
let teacherSchedulesData = null;

// Функция для получения списка аудиторий с учетом чекбокса
function getAuditoriesToShow() {
    const show602 = document.getElementById('show602Checkbox').checked;
    return show602 ? [...IPEauditories, ...additionalAuditories] : IPEauditories;
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
    }
    return response.json();
}

async function loadInitialData() {
    document.getElementById('loading').style.display = 'flex';
    try {
        // Обновляем текст загрузки
        document.querySelector('#loading span').textContent = 'Загрузка текущей недели...';
        
        // Загружаем текущую неделю
        currentWeekNumber = await fetchJson('https://iis.bsuir.by/api/v1/schedule/current-week');
        
        // Обновляем текст загрузки
        document.querySelector('#loading span').textContent = 'Загрузка данных преподавателей...';
        
        // Загружаем данные преподавателей
        const teachers = await fetchJson('https://iis.bsuir.by/api/v1/employees/all');
        teachersData = teachers;
        
        // Обновляем текст загрузки
        document.querySelector('#loading span').textContent = 'Загрузка расписаний преподавателей...';
        
        // Загружаем расписания преподавателей
        teacherSchedulesData = {};
        const promises = teachers.map(async (teacher) => {
            try {
                const schedule = await fetchJson(`https://iis.bsuir.by/api/v1/employees/schedule/${teacher.urlId}`);
                teacherSchedulesData[teacher.urlId] = schedule;
            } catch (error) {
                console.error(`Ошибка загрузки расписания для ${teacher.fio}:`, error);
                teacherSchedulesData[teacher.urlId] = { schedules: {} };
            }
        });
                
        await Promise.all(promises);
        
        // Устанавливаем дату из API (2025 год) вместо текущей
        const apiStartDate = new Date('2025-09-01'); // Начало семестра из API
        const yyyy = apiStartDate.getFullYear();
        const mm = String(apiStartDate.getMonth() + 1).padStart(2, '0');
        const dd = String(apiStartDate.getDate()).padStart(2, '0');
        document.getElementById('datePicker').value = `${yyyy}-${mm}-${dd}`;
        
        // Обновляем отображение недели
        const dayName = dayNames[apiStartDate.getDay()]; 
        document.getElementById('weekDisplay').textContent = `${apiStartDate.toLocaleDateString()} (${dayName}), ${currentWeekNumber}-я учебная неделя`;
        
        // Обновляем текст загрузки
        document.querySelector('#loading span').textContent = 'Формирование расписания...';
        
        // Загружаем расписание для даты из API
        await updateSchedule(apiStartDate, currentWeekNumber);
    } catch (error) {
        console.error('Ошибка при загрузке данных:', error);
        alert('Произошла ошибка при загрузке данных');
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function calculateWeekNumber(selectedDate) {
    if (!currentWeekNumber) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Исправленный расчет недели
    const diffTime = selectedDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    
    let weekNumber = ((currentWeekNumber - 1) + diffWeeks) % 4 + 1;
    return weekNumber <= 0 ? weekNumber + 4 : weekNumber;
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    try {
        const parts = dateStr.split('.');
        if (parts.length !== 3) return null;
        
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Месяцы 0-11
        const year = parseInt(parts[2], 10);
        
        return new Date(year, month, day);
    } catch (error) {
        console.error('Ошибка парсинга даты:', dateStr, error);
        return null;
    }
}

function timeInRange(start, end, target) {
    if (!start || !end || !target) return false;
    return start <= target && target <= end;
}

function isTimeInSlot(lessonStart, lessonEnd, slotStart, slotEnd) {
    const lessonStartTime = convertToMinutes(lessonStart);
    const lessonEndTime = convertToMinutes(lessonEnd);
    const slotStartTime = convertToMinutes(slotStart);
    const slotEndTime = convertToMinutes(slotEnd);
    
    return (lessonStartTime < slotEndTime && lessonEndTime > slotStartTime);
}

function convertToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function getLessonTypeClass(lessonType) {
    const typeMap = {
        'ЛК': 'lecture',
        'ПЗ': 'practice',
        'ЛР': 'lab',
        'Экзамен': 'exam',
        'Консультация': 'consultation',
        'Организация': 'organization',
        'Зачет': 'Test',
        'УПз': 'Instpractice',
        'УЛР': 'Instlab',
        'УЛк': 'Instlecture'
    };
    return typeMap[lessonType] || '';
}

async function getScheduleForAuditory(auditory, date, weekNumber) {
    const schedule = {};
    const dayName = dayNames[date.getDay()];
    
    if (!teachersData || !teacherSchedulesData) return schedule;

    for (const teacher of teachersData) {
        const teacherSchedule = teacherSchedulesData[teacher.urlId] || {};
        const daySchedule = teacherSchedule.schedules?.[dayName] || [];
        
        for (const lesson of daySchedule) {
            const weekNumbers = lesson?.weekNumber || [];
            
            if (lesson.auditories && lesson.auditories.includes(auditory) && 
                Array.isArray(weekNumbers) && weekNumbers.includes(weekNumber)) {
                
                const startDate = parseDate(lesson.startLessonDate);
                const endDate = parseDate(lesson.endLessonDate);
                const lessonDate = parseDate(lesson.dateLesson);
                
                // Проверяем даты из API (2025 год)
                if ((startDate && endDate && timeInRange(startDate, endDate, date)) || 
                    (lessonDate && date.toDateString() === lessonDate.toDateString())) {
                    
                    const lessonStartTime = lesson.startLessonTime;
                    const lessonEndTime = lesson.endLessonTime;
                    
                    for (const timeSlot of timeSlotsOrder) {
                        const [slotStart, slotEnd] = timeSlot.split('—');
                        
                        if (isTimeInSlot(lessonStartTime, lessonEndTime, slotStart, slotEnd)) {
                            if (!schedule[timeSlot]) {
                                schedule[timeSlot] = [];
                            }
                            schedule[timeSlot].push({
                                subject: lesson.subject,
                                type: lesson.lessonTypeAbbrev,
                                teacher: teacher.fio,
                                groups: lesson.studentGroups?.map(g => g.name) || [],
                                startTime: lessonStartTime,
                                endTime: lessonEndTime,
                                weekNumbers: weekNumbers // для отладки
                            });
                        }
                    }
                }
            }
        }
    }
    
    return schedule;
}

async function updateSchedule(date, weekNumber) {
    if (!weekNumber) {
        console.error('Не удалось определить номер недели');
        return;
    }

    document.getElementById('loading').style.display = 'flex';
    try {
        const schedulesContainer = document.getElementById('schedules');
        schedulesContainer.innerHTML = '';
        
        // Добавляем пустой угол в левый верхний
        const corner = document.createElement('div');
        corner.className = 'header-cell';
        corner.style.gridColumn = '1';
        corner.style.gridRow = '1';
        schedulesContainer.appendChild(corner);
        
        // Добавляем заголовки аудиторий
        const auditoriesToShow = getAuditoriesToShow();
        auditoriesToShow.forEach((auditory, index) => {
            const header = document.createElement('div');
            header.className = 'header-cell auditory-header';
            header.textContent = auditory;
            header.style.gridColumn = index + 2;
            header.style.gridRow = '1';
            schedulesContainer.appendChild(header);
        });
        
        const promises = auditoriesToShow.map(async (auditory) => {
            const schedule = await getScheduleForAuditory(auditory, date, weekNumber);
            return { auditory, schedule };
        });
        
        const results = await Promise.all(promises);
        
        // Получаем текущее время
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        // Находим текущий или следующий временной интервал
        let currentSlotIndex = -1;
        const isToday = date.toDateString() === new Date().toDateString();
        
        if (isToday) {
            // Ищем первый интервал, который еще не начался или в котором мы находимся
            for (let i = 0; i < timeSlotsOrder.length; i++) {
                const [start, end] = timeSlotsOrder[i].split('—');
                const startMinutes = convertToMinutes(start);
                const endMinutes = convertToMinutes(end);
                
                // Если текущее время до начала этого интервала - это наш следующий интервал
                if (currentMinutes < startMinutes) {
                    currentSlotIndex = i;
                    break;
                }
                // Если мы внутри этого интервала
                if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
                    currentSlotIndex = i;
                    break;
                }
            }
            
            // Если все интервалы прошли, выбираем последний
            if (currentSlotIndex === -1) {
                currentSlotIndex = timeSlotsOrder.length - 1;
            }
        }

        // Добавляем строки для каждого временного интервала
        timeSlotsOrder.forEach((timeSlot, timeIndex) => {
            // Заголовок временного интервала
            const timeHeader = document.createElement('div');
            timeHeader.className = 'time-cell';
            timeHeader.textContent = timeSlot;
            timeHeader.style.gridColumn = '1';
            timeHeader.style.gridRow = timeIndex + 2;
            
            // Подсвечиваем текущий/следующий временной интервал
            if (isToday && timeIndex === currentSlotIndex) {
                timeHeader.classList.add('current-time-slot');
            }
            
            schedulesContainer.appendChild(timeHeader);
            
            // Ячейки для каждой аудитории
            results.forEach((result, audIndex) => {
                const cell = document.createElement('div');
                cell.className = 'auditory-cell';
                cell.style.gridColumn = audIndex + 2;
                cell.style.gridRow = timeIndex + 2;
                
                // Подсвечиваем текущий/следующий временной интервал
                if (isToday && timeIndex === currentSlotIndex) {
                    cell.classList.add('current-time-slot');
                }
                
                const lessons = result.schedule[timeSlot];
                if (lessons && lessons.length > 0) {
                    lessons.forEach(lesson => {
                        const lessonDiv = document.createElement('div');
                        const typeClass = getLessonTypeClass(lesson.type);
                        lessonDiv.className = `lesson ${typeClass}`;
                        
                        const startTime = lesson.startTime.substring(0, 5);
                        const endTime = lesson.endTime.substring(0, 5);
                        const groupsText = lesson.groups.length > 0 
                            ? lesson.groups.map(g => 
                                `<a href="https://iis.bsuir.by/schedule/${g}" target="_blank" class="group-link">${g}</a>`
                              ).join(', ')
                            : '';
                        
                        lessonDiv.innerHTML = `
                            <div class="lesson-time">${startTime}—${endTime}</div>
                            <div class="lesson-subject">${lesson.subject}</div>
                            <div class="lesson-type">${lesson.type}</div>
                            ${groupsText ? `<div class="lesson-groups">${groupsText}</div>` : ''}
                            <div>${lesson.teacher}</div>
                        `;
                        cell.appendChild(lessonDiv);
                    });
                } else {
                    const noLessonDiv = document.createElement('div');
                    noLessonDiv.className = 'lesson no-lesson';
                    noLessonDiv.textContent = 'Занятий нет';
                    cell.appendChild(noLessonDiv);
                }
                
                schedulesContainer.appendChild(cell);
            });
        });
        
        // Если текущее время прошло текущий интервал, подсвечиваем следующий
        if (isToday && currentSlotIndex !== -1) {
            const [currentStart, currentEnd] = timeSlotsOrder[currentSlotIndex].split('—');
            const currentEndMinutes = convertToMinutes(currentEnd);
            
            if (currentMinutes > currentEndMinutes && currentSlotIndex < timeSlotsOrder.length - 1) {
                const nextTimeHeaders = schedulesContainer.querySelectorAll(`.time-cell:nth-child(${currentSlotIndex + 3})`);
                const nextAuditoryCells = schedulesContainer.querySelectorAll(`.auditory-cell:nth-child(${currentSlotIndex + 3})`);
                
                nextTimeHeaders.forEach(el => el.classList.add('current-time-slot'));
                nextAuditoryCells.forEach(el => el.classList.add('current-time-slot'));
            }
        }

        // Создаем мобильную версию
        createMobileVersion(results, date, weekNumber, isToday, currentSlotIndex);
    } catch (error) {
        console.error('Ошибка при обновлении расписания:', error);
        alert('Произошла ошибка при загрузке расписания');
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function createMobileVersion(results, date, weekNumber, isToday, currentSlotIndex) {
    // Удаляем предыдущую мобильную версию, если она есть
    const oldMobileContainer = document.getElementById('mobile-schedules');
    if (oldMobileContainer) {
        oldMobileContainer.remove();
    }

    // Проверяем, нужно ли показывать мобильную версию
    if (window.innerWidth > 768) {
        document.getElementById('schedules-container').style.display = 'block';
        return;
    }

    // Создаем контейнер для мобильной версии
    const mobileContainer = document.createElement('div');
    mobileContainer.id = 'mobile-schedules';

    // Для каждого временного интервала
    timeSlotsOrder.forEach((timeSlot, timeIndex) => {
        const timeContainer = document.createElement('div');
        timeContainer.className = 'mobile-time-container';
        
        // Подсвечиваем текущий временной интервал
        if (isToday && timeIndex === currentSlotIndex) {
            timeContainer.classList.add('current-time-slot-mobile');
        }
        
        // Заголовок времени
        const timeHeader = document.createElement('div');
        timeHeader.className = 'time-cell';
        timeHeader.textContent = timeSlot;
        timeContainer.appendChild(timeHeader);
        
        // Контейнер для аудиторий
        const auditoriesContainer = document.createElement('div');
        auditoriesContainer.className = 'mobile-auditories-container';
        
        // Собираем аудитории с занятиями в этом временном интервале
        const auditoriesWithLessons = results.filter(result => {
            return result.schedule[timeSlot] && result.schedule[timeSlot].length > 0;
        });
        
        if (auditoriesWithLessons.length > 0) {
            auditoriesWithLessons.forEach(result => {
                const auditoryCard = document.createElement('div');
                auditoryCard.className = 'mobile-auditory-card';
                
                // Название аудитории
                const auditoryName = document.createElement('div');
                auditoryName.className = 'mobile-auditory-name';
                auditoryName.textContent = result.auditory;
                auditoryCard.appendChild(auditoryName);
                
                // Занятия в этой аудитории
                result.schedule[timeSlot].forEach(lesson => {
                    const lessonDiv = document.createElement('div');
                    lessonDiv.className = 'mobile-lesson';
                    
                    const typeClass = getLessonTypeClass(lesson.type);
                    const startTime = lesson.startTime.substring(0, 5);
                    const endTime = lesson.endTime.substring(0, 5);
                    const groupsText = lesson.groups.length > 0 
                        ? lesson.groups.map(g => 
                            `<a href="https://iis.bsuir.by/schedule/${g}" target="_blank" class="mobile-group-link">${g}</a>`
                          ).join(', ')
                        : '';
                    
                    lessonDiv.innerHTML = `
                        <div class="mobile-lesson-time">${startTime}—${endTime}</div>
                        <div class="mobile-lesson-subject">${lesson.subject}</div>
                        <div class="mobile-lesson-type ${typeClass}">${lesson.type}</div>
                        ${groupsText ? `<div class="mobile-lesson-groups">${groupsText}</div>` : ''}
                        <div class="mobile-lesson-teacher">${lesson.teacher}</div>
                    `;
                    auditoryCard.appendChild(lessonDiv);
                });
                
                auditoriesContainer.appendChild(auditoryCard);
            });
        } else {
            const noLessons = document.createElement('div');
            noLessons.className = 'mobile-auditory-card';
            noLessons.textContent = 'Занятий нет';
            auditoriesContainer.appendChild(noLessons);
        }
        
        timeContainer.appendChild(auditoriesContainer);
        mobileContainer.appendChild(timeContainer);
    });
    
    // Прячем основную таблицу и показываем мобильную версию
    document.getElementById('schedules-container').style.display = 'none';
    document.getElementById('schedules-container').parentNode.insertBefore(mobileContainer, document.getElementById('schedules-container').nextSibling);
}

// Обработчик изменения размера окна
window.addEventListener('resize', function() {
    if (document.getElementById('datePicker') && document.getElementById('datePicker').value) {
        const selectedDate = new Date(document.getElementById('datePicker').value);
        const weekNumber = calculateWeekNumber(selectedDate);
        updateSchedule(selectedDate, weekNumber);
    }
});

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadInitialData();
    
    // Обработчик изменения даты
    document.getElementById('datePicker').addEventListener('change', async (e) => {
        const selectedDate = new Date(e.target.value);
        selectedDate.setHours(0, 0, 0, 0);
        
        const weekNumber = calculateWeekNumber(selectedDate);
        const dayName = dayNames[selectedDate.getDay()]; 
        document.getElementById('weekDisplay').textContent = `${selectedDate.toLocaleDateString()} (${dayName}), ${weekNumber}-я учебная неделя`;
        
        await updateSchedule(selectedDate, weekNumber);
    });
    
    // Обработчик изменения чекбокса
    document.getElementById('show602Checkbox').addEventListener('change', async () => {
        if (document.getElementById('datePicker') && document.getElementById('datePicker').value) {
            const selectedDate = new Date(document.getElementById('datePicker').value);
            const weekNumber = calculateWeekNumber(selectedDate);
            await updateSchedule(selectedDate, weekNumber);
        }
    });

    // Обработчики для кнопок переключения дней
    document.getElementById('prevDayBtn').addEventListener('click', () => {
        const datePicker = document.getElementById('datePicker');
        const currentDate = new Date(datePicker.value);
        currentDate.setDate(currentDate.getDate() - 1);
        
        // Форматируем дату обратно в формат YYYY-MM-DD
        const yyyy = currentDate.getFullYear();
        const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
        const dd = String(currentDate.getDate()).padStart(2, '0');
        const newDateStr = `${yyyy}-${mm}-${dd}`;
        
        datePicker.value = newDateStr;
        
        // Триггерим событие change
        datePicker.dispatchEvent(new Event('change'));
    });

    document.getElementById('nextDayBtn').addEventListener('click', () => {
        const datePicker = document.getElementById('datePicker');
        const currentDate = new Date(datePicker.value);
        currentDate.setDate(currentDate.getDate() + 1);
        
        // Форматируем дату обратно в формат YYYY-MM-DD
        const yyyy = currentDate.getFullYear();
        const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
        const dd = String(currentDate.getDate()).padStart(2, '0');
        const newDateStr = `${yyyy}-${mm}-${dd}`;
        
        datePicker.value = newDateStr;
        
        // Триггерим событие change
        datePicker.dispatchEvent(new Event('change'));
    });
});
