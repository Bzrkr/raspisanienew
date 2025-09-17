
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
        let lastIsMobile = (typeof window !== 'undefined') ? window.innerWidth <= 768 : false;

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
                teacherSchedulesData[teacher.urlId] = { schedules: {}, previousSchedules: {} };
            }
        });
                
                await Promise.all(promises);
                
                // Устанавливаем текущую дату
                const today = new Date();
                //today.setHours(0, 0, 0, 0);
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                document.getElementById('datePicker').value = `${yyyy}-${mm}-${dd}`;
                
                // Обновляем отображение недели
                const dayName = dayNames[today.getDay()]; 
                document.getElementById('weekDisplay').textContent = `${today.toLocaleDateString()} (${dayName}), ${currentWeekNumber}-я учебная неделя`;
                 // Обновляем текст загрузки
        document.querySelector('#loading span').textContent = 'Формирование расписания...';
                // Загружаем расписание для текущей даты
                await updateSchedule(today, currentWeekNumber);
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
           // today.setHours(0, 0, 0, 0);
            
            // Находим понедельник текущей недели
            const getMonday = (date) => {
                const day = date.getDay();
                const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Понедельник - первый день
                return new Date(date.setDate(diff));
            };
            
            const currentMonday = getMonday(new Date(today));
            const selectedMonday = getMonday(new Date(selectedDate));
            
            // Разница в неделях между выбранной датой и текущей неделей
            const diffTime = selectedMonday - currentMonday;
            const diffWeeks = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));
            
            // Вычисляем номер недели с учётом 4-недельного цикла
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
                
                for (const scheduleType of ['schedules', 'previousSchedules']) {
                    const daySchedule = teacherSchedule[scheduleType]?.[dayName] || [];
                    
                    for (const lesson of daySchedule) {
                        const weekNumbers = lesson?.weekNumber || [];
                        
                        if (lesson.auditories && lesson.auditories.includes(auditory) && 
                            Array.isArray(weekNumbers) && weekNumbers.includes(weekNumber)) {
                            
                            const startDate = parseDate(lesson.startLessonDate);
                            const endDate = parseDate(lesson.endLessonDate);
                            const lessonDate = parseDate(lesson.dateLesson);
                            
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
                                        const subjectDisplay = (lesson.subject && lesson.subject.trim())
                                            ? lesson.subject
                                            : ((lesson.note && lesson.note.trim()) ? 'ОБЪЯВЛЕНИЕ' : '');
                                        schedule[timeSlot].push({
                                            subject: subjectDisplay,
                                            type: lesson.lessonTypeAbbrev,
                                            note: lesson.note || null,
                                            startDate: lesson.startLessonDate || null,
                                            endDate: lesson.endLessonDate || null,
                                            dateLesson: lesson.dateLesson || null,
                                            weeks: Array.isArray(weekNumbers) ? weekNumbers : [],
                                            teacher: teacher.fio,
                                            teacherUrlId: teacher.urlId,
                                            groups: lesson.studentGroups?.map(g => g.name) || [],
                                            startTime: lessonStartTime,
                                            endTime: lessonEndTime
                                        });
                                    }
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
                    {
                        const [tsStart, tsEnd] = timeSlot.split('—');
                        const startStr = tsStart.trim();
                        const endStr = tsEnd.trim();
                        const startMin = convertToMinutes(startStr);
                        const endMin = convertToMinutes(endStr);
                        let topState = 'upcoming';
                        let bottomState = 'upcoming';
                        if (isToday) {
                            if (currentMinutes < startMin) {
                                topState = 'upcoming';
                                bottomState = 'upcoming';
                            } else if (currentMinutes >= startMin && currentMinutes < endMin) {
                                topState = 'now';
                                bottomState = 'ongoing-end';
                            } else if (currentMinutes >= endMin) {
                                topState = 'past';
                                bottomState = 'past';
                            }
                        }
                        timeHeader.innerHTML = `
                            <div class=\"time-start\">${startStr}</div>
                            <div class=\"time-end\">${endStr}</div>
                            <span class=\"time-dot time-dot-top ${topState}\"></span>
                            <span class=\"time-dot time-dot-bottom ${bottomState}\"></span>
                        `;
                    }
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
                                
                                const periodHtml = (lesson.dateLesson && lesson.dateLesson.trim())
                                    ? `<div class=\"lesson-period\">Дата: ${lesson.dateLesson}</div>`
                                    : ((lesson.startDate || lesson.endDate)
                                        ? `<div class=\"lesson-period\">Период: с ${lesson.startDate || ''}${(lesson.startDate && lesson.endDate) ? ' по ' : ''}${lesson.endDate || ''}</div>`
                                        : '');
                                const weeksHtml = (lesson.weeks && lesson.weeks.length > 0)
                                    ? `<div class=\"lesson-weeks\">Недели: ${lesson.weeks.join(', ')}</div>`
                                    : '';
                                const teacherUrl = lesson.teacherUrlId
                                    ? `https://iis.bsuir.by/schedule/${encodeURIComponent(lesson.teacherUrlId)}`
                                    : `https://iis.bsuir.by/schedule/`;
                                lessonDiv.innerHTML = `
                                    <div class="lesson-time">${startTime}—${endTime}</div>
                                    ${(periodHtml || weeksHtml) ? `<div class=\"lesson-meta\">${periodHtml}${weeksHtml}</div>` : ''}
                                    <div class="lesson-subject">${lesson.subject}${lesson.type ? ` <span class=\"lesson-type-inline\">(${lesson.type})</span>` : ''}</div>
                                    ${groupsText ? `<div class="lesson-groups">${groupsText}</div>` : ''}
                                    <div><a href="${teacherUrl}" target="_blank" rel="noopener" class="teacher-link">${lesson.teacher}</a></div>
                                    ${lesson.note ? `<div class="lesson-note">${lesson.note}</div>` : ''}
                                `;
                                // Toggle meta visibility on time click
                                const desktopMetaEl = lessonDiv.querySelector('.lesson-meta');
                                const desktopTimeEl = lessonDiv.querySelector('.lesson-time');
                                if (desktopMetaEl && desktopTimeEl) {
                                    desktopMetaEl.style.display = 'none';
                                    desktopTimeEl.addEventListener('click', () => {
                                        desktopMetaEl.style.display = (desktopMetaEl.style.display === 'none') ? 'block' : 'none';
                                    });
                                }
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
            const rootFragment = document.createDocumentFragment();

            // Предрасчет первых и последних появлений аудитории за день (по всем слотам)
            const auditoryAppearanceMap = new Map(); // auditory -> { firstIndex, lastIndex }
            results.forEach(r => {
                let firstIndex = null;
                let lastIndex = null;
                timeSlotsOrder.forEach((slot, idx) => {
                    const hasLessons = r.schedule[slot] && r.schedule[slot].length > 0;
                    if (hasLessons) {
                        if (firstIndex === null) firstIndex = idx;
                        lastIndex = idx;
                    }
                });
                if (firstIndex !== null) {
                    auditoryAppearanceMap.set(r.auditory, { firstIndex, lastIndex });
                }
            });

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
                const displayTime = timeSlot.replace('—', ' - ');
                timeHeader.textContent = displayTime;
                timeContainer.appendChild(timeHeader);
                
                // Контейнер для аудиторий
                const auditoriesContainer = document.createElement('div');
                auditoriesContainer.className = 'mobile-auditories-container';
                const audFrag = document.createDocumentFragment();
                
                // Собираем аудитории с занятиями в этом временном интервале
                const auditoriesWithLessons = results.filter(result => {
                    return result.schedule[timeSlot] && result.schedule[timeSlot].length > 0;
                });
                
                // Получаем список всех аудиторий для отображения
                const allAuditoriesToShow = getAuditoriesToShow();
                
                // Если есть занятия или включен чекбокс "Показать все кабинеты", показываем аудитории
                if (auditoriesWithLessons.length > 0 || document.getElementById('showAllAuditoriesCheckbox').checked) {
                    // Если включен чекбокс, показываем все аудитории, иначе только с занятиями
                    const auditoriesToDisplay = document.getElementById('showAllAuditoriesCheckbox').checked ? results : auditoriesWithLessons;
                    
                    auditoriesToDisplay.forEach(result => {
                        const auditoryCard = document.createElement('div');
                        auditoryCard.className = 'mobile-auditory-card';
                        
                        // Название аудитории
                        const auditoryName = document.createElement('div');
                        auditoryName.className = 'mobile-auditory-name';
                        let emoji = '';
                        const appearance = auditoryAppearanceMap.get(result.auditory);
                        if (appearance) {
                            if (timeIndex === appearance.firstIndex && timeIndex === appearance.lastIndex) {
                                // Первая и одновременно последняя пара в этой аудитории за день — закрыто (нужно открыть) и закрыть по завершению
                                emoji = ' 🔐🔑';
                            } else if (timeIndex === appearance.firstIndex) {
                                // Первая пара в этой аудитории за день — закрыто (нужно открыть)
                                emoji = ' 🔐';
                            } else if (timeIndex < appearance.lastIndex) {
                                // Продолжаются занятия позже — открыто
                                emoji = ' 🔓';
                            } else if (timeIndex === appearance.lastIndex) {
                                // Последняя пара в этой аудитории за день — закрыть по завершению
                                emoji = ' 🔑';
                            }
                        }
                        // Установим текст заголовка позже, после проверки наличия занятий в слоте
                        auditoryName.textContent = result.auditory;
                        auditoryCard.appendChild(auditoryName);
                        
                        // Занятия в этой аудитории
                        const lessonsInThisSlot = result.schedule[timeSlot] || [];
                        // Добавляем эмодзи только если в этом слоте есть занятия
                        if (lessonsInThisSlot.length > 0) {
                            auditoryName.textContent = result.auditory + emoji;
                        } else {
                            auditoryName.textContent = result.auditory;
                        }
                        if (lessonsInThisSlot.length > 0) {
                            lessonsInThisSlot.forEach(lesson => {
                            const lessonDiv = document.createElement('div');
                            const typeClass = getLessonTypeClass(lesson.type);
                            lessonDiv.className = `mobile-lesson ${typeClass}`;
                            const startTime = lesson.startTime.substring(0, 5);
                            const endTime = lesson.endTime.substring(0, 5);
                            const groupsText = lesson.groups.length > 0 
                                ? lesson.groups.map(g => 
                                    `<a href="https://iis.bsuir.by/schedule/${g}" target="_blank" class="mobile-group-link">${g}</a>`
                                  ).join(', ')
                                : '';
                            
                            const periodHtml = (lesson.dateLesson && lesson.dateLesson.trim())
                                ? `<div class=\"mobile-lesson-period\">Дата: ${lesson.dateLesson}</div>`
                                : ((lesson.startDate || lesson.endDate)
                                    ? `<div class=\"mobile-lesson-period\">Период: с ${lesson.startDate || ''}${(lesson.startDate && lesson.endDate) ? ' по ' : ''}${lesson.endDate || ''}</div>`
                                    : '');
                            const weeksHtml = (lesson.weeks && lesson.weeks.length > 0)
                                ? `<div class=\"mobile-lesson-weeks\">Недели: ${lesson.weeks.join(', ')}</div>`
                                : '';
                            const teacherUrl = lesson.teacherUrlId
                                ? `https://iis.bsuir.by/schedule/${encodeURIComponent(lesson.teacherUrlId)}`
                                : `https://iis.bsuir.by/schedule/`;
                            lessonDiv.innerHTML = `
                                <div class="mobile-lesson-time">${startTime}—${endTime}</div>
                                ${(periodHtml || weeksHtml) ? `<div class=\"mobile-lesson-meta\">${periodHtml}${weeksHtml}</div>` : ''}
                                <div class="mobile-lesson-subject">${lesson.subject}${lesson.type ? ` <span class=\"lesson-type-inline\">(${lesson.type})</span>` : ''}</div>
                                ${groupsText ? `<div class="mobile-lesson-groups">${groupsText}</div>` : ''}
                                <div class="mobile-lesson-teacher"><a href="${teacherUrl}" target="_blank" rel="noopener" class="teacher-link">${lesson.teacher}</a></div>
                                ${lesson.note ? `<div class="mobile-lesson-note">${lesson.note}</div>` : ''}
                            `;
                            // Toggle meta visibility on time click (mobile)
                            const mobileMetaEl = lessonDiv.querySelector('.mobile-lesson-meta');
                            const mobileTimeEl = lessonDiv.querySelector('.mobile-lesson-time');
                            if (mobileMetaEl && mobileTimeEl) {
                                mobileMetaEl.style.display = 'none';
                                mobileTimeEl.addEventListener('click', () => {
                                    mobileMetaEl.style.display = (mobileMetaEl.style.display === 'none') ? 'block' : 'none';
                                });
                            }
                            auditoryCard.appendChild(lessonDiv);
                        });
                        } else {
                            // Если занятий нет, но чекбокс "Показать все кабинеты" включен, показываем сообщение
                            const noLessonDiv = document.createElement('div');
                            noLessonDiv.className = 'mobile-lesson no-lesson';
                            noLessonDiv.textContent = 'Занятий нет';
                            auditoryCard.appendChild(noLessonDiv);
                        }
                        
                        audFrag.appendChild(auditoryCard);
                    });
                    auditoriesContainer.appendChild(audFrag);
                } else if (!document.getElementById('showAllAuditoriesCheckbox').checked) {
                    // Показываем "Занятий нет" только если чекбокс "Показать все кабинеты" не включен
                    const noLessons = document.createElement('div');
                    noLessons.className = 'mobile-auditory-card';
                    noLessons.textContent = 'Занятий нет';
                    audFrag.appendChild(noLessons);
                    auditoriesContainer.appendChild(audFrag);
                }
                
                timeContainer.appendChild(auditoriesContainer);
                rootFragment.appendChild(timeContainer);
            });
            mobileContainer.appendChild(rootFragment);
            
            // Прячем основную таблицу и показываем мобильную версию
            document.getElementById('schedules-container').style.display = 'none';
            document.getElementById('schedules-container').parentNode.insertBefore(mobileContainer, document.getElementById('schedules-container').nextSibling);
        }

        // Обработчик изменения размера окна — перерисовываем ТОЛЬКО при смене брейкпоинта (mobile/desktop)
        window.addEventListener('resize', function() {
            const nowIsMobile = window.innerWidth <= 768;
            if (nowIsMobile === lastIsMobile) return;
            lastIsMobile = nowIsMobile;
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
            
            // Обработчик изменения чекбокса 602-2 к.
            document.getElementById('show602Checkbox').addEventListener('change', async () => {
                if (document.getElementById('datePicker') && document.getElementById('datePicker').value) {
                    const selectedDate = new Date(document.getElementById('datePicker').value);
                    const weekNumber = calculateWeekNumber(selectedDate);
                    await updateSchedule(selectedDate, weekNumber);
                }
            });
            
            // Обработчик изменения чекбокса "Показать все кабинеты"
            document.getElementById('showAllAuditoriesCheckbox').addEventListener('change', async () => {
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
});});
