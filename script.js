/**
 * Exam Study Planner (StudyForge) - Phase 2 Script
 * 
 * Functional Subject Management:
 * - Persistent storage with browser localStorage (key: "studyPlanner")
 * - Dynamic subject card rendering with safe DOM methods (createElement / textContent)
 * - Input validation & future exam date verification
 * - Dynamic calculation of days remaining from the current local date
 * - Subject deletion with confirmation
 * - Daily study hours synchronization
 * - Preserved Phase 1 single-page navigation and visual demonstrations
 */

// Global constant for localStorage key
const STORAGE_KEY = "studyPlanner";

// In-memory application state
let appData = {
  dailyHours: 4,
  subjects: []
};

// Wait for the DOM to be fully loaded before initializing
document.addEventListener("DOMContentLoaded", () => {
  loadData();
  initDailyHoursSync();
  initSubjectForm();
  renderSubjects();

  // Preserved Phase 1 interactions
  initAppNavigation();
  initDateStripSelection();
  initTaskChecklist();
  initDemonstrationActions();
});

/* ==========================================================================
   1. Data Persistence & localStorage Management
   ========================================================================== */

/**
 * Returns the default sample demo courses used when the user opens the
 * application for the very first time with no prior saved data.
 * @returns {Array<Object>}
 */
function getDefaultDemoSubjects() {
  return [
    {
      id: "demo-os",
      name: "Operating Systems",
      code: "CS-301",
      examDate: "2026-11-14",
      difficulty: "Hard",
      units: [
        "Processes & Threads",
        "CPU Scheduling",
        "Memory Management & Paging",
        "Deadlocks & Synchronization",
        "File Systems & Storage"
      ],
      theme: "os-theme",
      isDemo: true
    },
    {
      id: "demo-cn",
      name: "Computer Networks",
      code: "CS-304",
      examDate: "2026-11-18",
      difficulty: "Medium",
      units: [
        "Physical & Data Link Layers",
        "CRC & Framing Protocols",
        "Subnetting & Routing",
        "Transport Layer (TCP/UDP)"
      ],
      theme: "cn-theme",
      isDemo: true
    },
    {
      id: "demo-web",
      name: "Web Programming",
      code: "CS-308",
      examDate: "2026-11-22",
      difficulty: "Easy",
      units: [
        "Semantic HTML5 & Accessibility",
        "Modern CSS Grid & Flexbox",
        "Vanilla DOM Scripting",
        "Asynchronous Web APIs",
        "Client Security & Forms"
      ],
      theme: "web-theme",
      isDemo: true
    }
  ];
}

/**
 * Loads saved subjects and study settings from localStorage.
 * Handles first-time visitors by initializing demo data, preserves existing
 * empty arrays, and gracefully catches corrupted JSON.
 */
function loadData() {
  const savedJson = localStorage.getItem(STORAGE_KEY);

  // If no saved entry exists at all, this is a first-time visit: seed demo data
  if (savedJson === null) {
    appData = {
      dailyHours: 4,
      subjects: getDefaultDemoSubjects()
    };
    saveData();
    return;
  }

  // If saved data exists, parse it safely
  try {
    const parsed = JSON.parse(savedJson);

    if (parsed && typeof parsed === "object") {
      // Validate daily hours setting
      appData.dailyHours =
        typeof parsed.dailyHours === "number" && parsed.dailyHours >= 1 && parsed.dailyHours <= 14
          ? parsed.dailyHours
          : 4;

      // Validate subjects array (preserves empty list if user deleted all subjects)
      appData.subjects = Array.isArray(parsed.subjects) ? parsed.subjects : [];
    } else {
      throw new Error("Invalid root data shape in saved JSON");
    }
  } catch (error) {
    // Malformed JSON: warn and recover safely without crashing
    console.warn("StudyPlanner: Corrupted localStorage data encountered. Initializing defaults.", error);
    appData = {
      dailyHours: 4,
      subjects: getDefaultDemoSubjects()
    };
    saveData();
  }
}

/**
 * Saves current in-memory application state to localStorage.
 */
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  } catch (error) {
    console.error("StudyPlanner: Failed to save data to localStorage", error);
  }
}

/* ==========================================================================
   2. Input Parsing, Date Calculations & Validation
   ========================================================================== */

/**
 * Parses raw text into an array of clean syllabus unit strings.
 * Handles entries separated by newlines, commas, or both, trimming whitespace
 * and discarding empty lines.
 * @param {string} rawInput 
 * @returns {Array<string>}
 */
function parseSyllabusUnits(rawInput) {
  if (!rawInput) return [];
  return rawInput
    .split(/[\n,]+/)
    .map((unit) => unit.trim())
    .filter((unit) => unit.length > 0);
}

/**
 * Calculates days remaining from the current local date (midnight)
 * to the exam date (midnight).
 * @param {string} examDateString - Date in "YYYY-MM-DD" format
 * @returns {number}
 */
function getDaysRemaining(examDateString) {
  if (!examDateString) return 0;

  // Normalize both dates to midnight local time to avoid timezone drift
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const parts = examDateString.split("-").map(Number);
  const examMidnight = new Date(parts[0], parts[1] - 1, parts[2]);

  const diffMs = examMidnight.getTime() - todayMidnight.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Formats a "YYYY-MM-DD" date string into a user-friendly format (e.g. "Nov 14, 2026").
 * @param {string} dateString 
 * @returns {string}
 */
function formatDate(dateString) {
  if (!dateString) return "";
  const parts = dateString.split("-").map(Number);
  const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
  return dateObj.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

/**
 * Returns a human-friendly string for the remaining days.
 * @param {number} days 
 * @returns {string}
 */
function formatDaysRemaining(days) {
  if (days > 1) return `${days} Days Left`;
  if (days === 1) return "1 Day Left (Tomorrow)";
  if (days === 0) return "Exam Today";
  return `${Math.abs(days)} Days Overdue`;
}

/**
 * Validates subject form input fields.
 * Ensures subject name is present, exam date is in the future,
 * and at least one syllabus unit has been entered.
 * @param {string} name 
 * @param {string} examDate 
 * @param {Array<string>} units 
 * @param {string} difficulty 
 * @returns {{isValid: boolean, message?: string}}
 */
function validateSubject(name, examDate, units, difficulty) {
  if (!name) {
    return { isValid: false, message: "Please enter a Subject Name." };
  }

  if (!examDate) {
    return { isValid: false, message: "Please select a valid Exam Date." };
  }

  const daysLeft = getDaysRemaining(examDate);
  if (daysLeft <= 0) {
    return { isValid: false, message: "Exam date must be in the future (tomorrow or later)." };
  }

  if (!units || units.length === 0) {
    return { isValid: false, message: "Please provide at least one syllabus unit (separate with newlines or commas)." };
  }

  if (!["Easy", "Medium", "Hard"].includes(difficulty)) {
    return { isValid: false, message: "Please select a valid difficulty level (Easy, Medium, or Hard)." };
  }

  return { isValid: true };
}

/* ==========================================================================
   3. Subject Management (Add, Delete & Render)
   ========================================================================== */

/**
 * Initializes form submission listeners and sets the minimum selectable exam date.
 */
function initSubjectForm() {
  const form = document.getElementById("subject-entry-form");
  const examDateInput = document.getElementById("exam-date");

  // Prevent selecting dates in the past via the HTML datepicker
  if (examDateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    examDateInput.min = `${yyyy}-${mm}-${dd}`;
  }

  if (form) {
    form.addEventListener("submit", addSubject);
  }
}

/**
 * Handles adding a new subject from the form.
 * @param {Event} event 
 */
function addSubject(event) {
  if (event) event.preventDefault();

  const nameInput = document.getElementById("subject-name");
  const dateInput = document.getElementById("exam-date");
  const unitsTextarea = document.getElementById("syllabus-units");
  const difficultyRadio = document.querySelector('input[name="difficulty"]:checked');
  const dailyHoursInput = document.getElementById("daily-hours");
  const formFeedback = document.getElementById("form-feedback");

  const name = nameInput ? nameInput.value.trim() : "";
  const examDate = dateInput ? dateInput.value : "";
  const units = unitsTextarea ? parseSyllabusUnits(unitsTextarea.value) : [];
  const difficulty = difficultyRadio ? difficultyRadio.value : "Medium";

  // Validate inputs
  const validation = validateSubject(name, examDate, units, difficulty);

  if (!validation.isValid) {
    if (formFeedback) {
      formFeedback.textContent = validation.message;
      formFeedback.className = "form-feedback error";
      formFeedback.classList.remove("hidden");
    }
    return;
  }

  // Clear any existing error
  if (formFeedback) {
    formFeedback.classList.add("hidden");
  }

  // Choose a pleasing theme accent for the new card
  const themePalette = ["os-theme", "cn-theme", "web-theme", "warm-theme", "teal-theme"];
  const theme = themePalette[appData.subjects.length % themePalette.length];

  // Construct new subject object
  const newSubject = {
    id: "subj-" + Date.now(),
    name: name,
    code: `CS-${300 + appData.subjects.length + 1}`,
    examDate: examDate,
    difficulty: difficulty,
    units: units,
    theme: theme,
    isDemo: false
  };

  // Add to in-memory state
  appData.subjects.push(newSubject);

  // Sync daily study hours if modified in the form
  if (dailyHoursInput) {
    const hoursVal = parseFloat(dailyHoursInput.value);
    if (!isNaN(hoursVal) && hoursVal >= 1 && hoursVal <= 14) {
      appData.dailyHours = hoursVal;
      updateHeaderDailyHours();
    }
  }

  // Save to localStorage and re-render the subject cards
  saveData();
  renderSubjects();

  // Reset form inputs
  if (nameInput) nameInput.value = "";
  if (unitsTextarea) unitsTextarea.value = "";
  const mediumRadio = document.getElementById("diff-med");
  if (mediumRadio) mediumRadio.checked = true;

  // Display temporary success confirmation
  if (formFeedback) {
    formFeedback.textContent = `Subject "${name}" added successfully!`;
    formFeedback.className = "form-feedback success";
    formFeedback.classList.remove("hidden");
    setTimeout(() => {
      formFeedback.classList.add("hidden");
    }, 3500);
  }
}

/**
 * Deletes a subject after user confirmation.
 * @param {string} subjectId 
 */
function deleteSubject(subjectId) {
  const subject = appData.subjects.find((s) => s.id === subjectId);
  if (!subject) return;

  const isConfirmed = window.confirm(`Are you sure you want to delete "${subject.name}" from your study planner?`);
  if (!isConfirmed) return;

  // Filter out the deleted subject
  appData.subjects = appData.subjects.filter((s) => s.id !== subjectId);

  // Save changes and update display
  saveData();
  renderSubjects();
}

/**
 * Dynamically renders the enrolled subject cards into the DOM.
 * Follows safe DOM construction using document.createElement and textContent.
 */
function renderSubjects() {
  const container = document.getElementById("subject-cards-list");
  const countBadge = document.getElementById("subject-counter-badge");
  const subtext = document.getElementById("subject-list-subtext");

  if (!container) return;

  // Update counter badge
  if (countBadge) {
    countBadge.textContent = `${appData.subjects.length} Registered`;
  }

  // Update card subtext
  if (subtext) {
    if (appData.subjects.length === 0) {
      subtext.textContent = "0 courses currently registered in your study schedule";
    } else {
      subtext.textContent = `${appData.subjects.length} courses registered in your study schedule`;
    }
  }

  // Safely clear the container
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  // If no subjects exist, display a clean empty-state message
  if (appData.subjects.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "empty-subjects-message";
    emptyMsg.textContent = "No subjects registered yet. Complete the form above to add your first course module.";
    container.appendChild(emptyMsg);
    return;
  }

  // Render each subject card
  appData.subjects.forEach((subject) => {
    const card = document.createElement("article");
    card.className = `subject-card ${subject.theme || "os-theme"}`;

    // 1. Header (Title, Code, Badges, Delete Button)
    const headerDiv = document.createElement("div");
    headerDiv.className = "subject-card-header";

    const titleGroup = document.createElement("div");

    const nameHeading = document.createElement("h4");
    nameHeading.className = "subject-name";
    nameHeading.textContent = subject.name; // Safe text insertion

    const codeSpan = document.createElement("span");
    codeSpan.className = "subject-code";
    const unitWord = subject.units.length === 1 ? "Unit" : "Units";
    codeSpan.textContent = subject.code ? `${subject.code} • ${subject.units.length} ${unitWord}` : `${subject.units.length} ${unitWord}`;

    titleGroup.appendChild(nameHeading);
    titleGroup.appendChild(codeSpan);

    const actionsGroup = document.createElement("div");
    actionsGroup.className = "subject-card-actions";

    // Demo badge if seeded as sample data
    if (subject.isDemo) {
      const demoBadge = document.createElement("span");
      demoBadge.className = "badge-demo";
      demoBadge.textContent = "Demo";
      actionsGroup.appendChild(demoBadge);
    }

    // Difficulty badge
    const diffBadge = document.createElement("span");
    diffBadge.className = `badge badge-${subject.difficulty.toLowerCase()}`;
    diffBadge.textContent = subject.difficulty;
    actionsGroup.appendChild(diffBadge);

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-delete";
    deleteBtn.textContent = "Delete";
    deleteBtn.setAttribute("aria-label", `Delete ${subject.name}`);
    deleteBtn.addEventListener("click", () => deleteSubject(subject.id));
    actionsGroup.appendChild(deleteBtn);

    headerDiv.appendChild(titleGroup);
    headerDiv.appendChild(actionsGroup);
    card.appendChild(headerDiv);

    // 2. Meta row (Exam Date and Calculated Days Remaining)
    const metaDiv = document.createElement("div");
    metaDiv.className = "subject-meta";

    // Exam date meta item
    const examMetaItem = document.createElement("div");
    examMetaItem.className = "meta-item";
    const examMetaLabel = document.createElement("span");
    examMetaLabel.className = "meta-label";
    examMetaLabel.textContent = "Exam Date";
    const examMetaVal = document.createElement("span");
    examMetaVal.className = "meta-val";
    examMetaVal.textContent = formatDate(subject.examDate);
    examMetaItem.appendChild(examMetaLabel);
    examMetaItem.appendChild(examMetaVal);

    // Days left meta item (calculated dynamically from current local date)
    const daysMetaItem = document.createElement("div");
    daysMetaItem.className = "meta-item";
    const daysMetaLabel = document.createElement("span");
    daysMetaLabel.className = "meta-label";
    daysMetaLabel.textContent = "Days Left";
    const daysMetaVal = document.createElement("span");
    daysMetaVal.className = "meta-val highlight-val";
    const daysRemaining = getDaysRemaining(subject.examDate);
    daysMetaVal.textContent = formatDaysRemaining(daysRemaining);
    daysMetaItem.appendChild(daysMetaLabel);
    daysMetaItem.appendChild(daysMetaVal);

    metaDiv.appendChild(examMetaItem);
    metaDiv.appendChild(daysMetaItem);
    card.appendChild(metaDiv);

    // 3. Units Preview Tags
    const unitsDiv = document.createElement("div");
    unitsDiv.className = "units-preview";

    const displayLimit = 3;
    const unitsToShow = subject.units.slice(0, displayLimit);
    unitsToShow.forEach((unitName) => {
      const unitTag = document.createElement("span");
      unitTag.className = "unit-tag";
      unitTag.textContent = unitName; // Safe text insertion
      unitsDiv.appendChild(unitTag);
    });

    if (subject.units.length > displayLimit) {
      const moreTag = document.createElement("span");
      moreTag.className = "unit-tag";
      moreTag.textContent = `+${subject.units.length - displayLimit} more`;
      unitsDiv.appendChild(moreTag);
    }

    card.appendChild(unitsDiv);

    // Append card to list
    container.appendChild(card);
  });
}

/* ==========================================================================
   4. Daily Hours Synchronization
   ========================================================================== */

/**
 * Keeps the daily study hours input and header badge in sync with appData.
 */
function initDailyHoursSync() {
  const dailyHoursInput = document.getElementById("daily-hours");

  if (dailyHoursInput) {
    dailyHoursInput.value = appData.dailyHours;

    dailyHoursInput.addEventListener("input", () => {
      const hours = parseFloat(dailyHoursInput.value);
      if (!isNaN(hours) && hours >= 1 && hours <= 14) {
        appData.dailyHours = hours;
        updateHeaderDailyHours();
        saveData();
      }
    });
  }

  updateHeaderDailyHours();
}

/**
 * Updates the header chip displaying target daily hours.
 */
function updateHeaderDailyHours() {
  const headerChip = document.getElementById("header-daily-hours");
  if (headerChip) {
    headerChip.textContent = `${appData.dailyHours.toFixed(1)} hrs/day`;
  }
}

/* ==========================================================================
   5. Preserved Phase 1 Screen Navigation
   ========================================================================== */

function initAppNavigation() {
  const navButtons = document.querySelectorAll(".nav-item, .mobile-tab-btn");

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetViewId = button.getAttribute("data-view");
      if (targetViewId) {
        switchView(targetViewId);
      }
    });
  });

  const emptyStateSetupBtn = document.getElementById("btn-empty-goto-setup");
  if (emptyStateSetupBtn) {
    emptyStateSetupBtn.addEventListener("click", () => {
      switchView("view-setup");
    });
  }

  const viewPlanFeedbackBtn = document.getElementById("btn-view-generated-plan");
  if (viewPlanFeedbackBtn) {
    viewPlanFeedbackBtn.addEventListener("click", () => {
      switchView("view-plan");
    });
  }
}

function switchView(viewId) {
  const allViews = document.querySelectorAll(".view-panel");
  allViews.forEach((view) => {
    view.hidden = true;
    view.classList.remove("active-view");
  });

  const activeView = document.getElementById(viewId);
  if (activeView) {
    activeView.hidden = false;
    activeView.classList.add("active-view");
  }

  const allNavButtons = document.querySelectorAll(".nav-item, .mobile-tab-btn");
  allNavButtons.forEach((btn) => {
    if (btn.getAttribute("data-view") === viewId) {
      btn.classList.add("active");
      if (btn.hasAttribute("aria-selected")) {
        btn.setAttribute("aria-selected", "true");
      }
    } else {
      btn.classList.remove("active");
      if (btn.hasAttribute("aria-selected")) {
        btn.setAttribute("aria-selected", "false");
      }
    }
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ==========================================================================
   6. Preserved Phase 1 Date Strip Selection
   ========================================================================== */

function initDateStripSelection() {
  const dateChips = document.querySelectorAll(".date-chip");
  const selectedDateHeading = document.getElementById("selected-date-title");

  dateChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      dateChips.forEach((c) => {
        c.classList.remove("active");
        c.setAttribute("aria-selected", "false");
      });

      chip.classList.add("active");
      chip.setAttribute("aria-selected", "true");

      const dayName = chip.getAttribute("data-day-name");
      if (selectedDateHeading && dayName) {
        selectedDateHeading.textContent = `Schedule for ${dayName}, 2026`;
      }
    });
  });
}

/* ==========================================================================
   7. Preserved Phase 1 Today Checklist
   ========================================================================== */

function initTaskChecklist() {
  const checkboxes = document.querySelectorAll(".task-checkbox");
  const counterText = document.getElementById("task-counter-text");
  const completionBadge = document.getElementById("day-completion-badge");

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const parentRow = checkbox.closest(".task-row");
      if (parentRow) {
        if (checkbox.checked) {
          parentRow.classList.add("completed");
        } else {
          parentRow.classList.remove("completed");
        }
      }
      updateTaskCompletionStats(checkboxes, counterText, completionBadge);
    });
  });
}

function updateTaskCompletionStats(checkboxes, counterText, badge) {
  let completedCount = 0;
  const totalCount = checkboxes.length;

  checkboxes.forEach((cb) => {
    if (cb.checked) {
      completedCount++;
    }
  });

  if (counterText) {
    counterText.textContent = `${completedCount} of ${totalCount} sample sessions completed (Visual preview)`;
  }

  if (badge) {
    if (completedCount === totalCount && totalCount > 0) {
      badge.textContent = "All Done!";
      badge.style.backgroundColor = "var(--sage-soft)";
      badge.style.color = "var(--primary-green)";
    } else if (completedCount > 0) {
      badge.textContent = "In Progress";
      badge.style.backgroundColor = "var(--bg-surface-warm)";
      badge.style.color = "var(--text-secondary)";
    } else {
      badge.textContent = "Not Started";
      badge.style.backgroundColor = "var(--bg-surface-warm)";
      badge.style.color = "var(--text-secondary)";
    }
  }
}

/* ==========================================================================
   8. Preserved Phase 1 Demonstration Triggers
   ========================================================================== */

function initDemonstrationActions() {
  const generatePlanBtn = document.getElementById("btn-generate-plan");
  const planFeedbackBanner = document.getElementById("plan-generation-feedback");

  if (generatePlanBtn && planFeedbackBanner) {
    generatePlanBtn.addEventListener("click", () => {
      planFeedbackBanner.classList.remove("hidden");
      planFeedbackBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  const replanBtn = document.getElementById("btn-replan");
  const replanFeedbackBanner = document.getElementById("replan-demo-feedback");

  if (replanBtn && replanFeedbackBanner) {
    replanBtn.addEventListener("click", () => {
      replanFeedbackBanner.classList.toggle("hidden");
    });
  }

  const toggleEmptyStateBtn = document.getElementById("btn-toggle-empty-state");
  const populatedContainer = document.getElementById("plan-populated-container");
  const emptyStateContainer = document.getElementById("plan-empty-state");

  if (toggleEmptyStateBtn && populatedContainer && emptyStateContainer) {
    toggleEmptyStateBtn.addEventListener("click", () => {
      const isCurrentlyEmpty = !emptyStateContainer.classList.contains("hidden");

      if (isCurrentlyEmpty) {
        emptyStateContainer.classList.add("hidden");
        populatedContainer.style.display = "block";
        toggleEmptyStateBtn.querySelector("span").textContent = "Toggle Empty State (Demo)";
      } else {
        emptyStateContainer.classList.remove("hidden");
        populatedContainer.style.display = "none";
        toggleEmptyStateBtn.querySelector("span").textContent = "Restore Sample Schedule";
      }
    });
  }
}
