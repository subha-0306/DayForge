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
  subjects: [],
  completedSessions: {},
  completedUnits: {},
  planGenerated: false
};

// Phase 4 & 5: In-memory live schedule state (null until user generates or re-plans)
let activePlan = null;
let selectedPlanDate = null;

// Wait for the DOM to be fully loaded before initializing (guarded for headless/Node testing)
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    loadData();
    initDailyHoursSync();
    initSubjectForm();
    renderSubjects();

    // Phase 4: Study Plan Engine Initialization
    initStudyPlanEngine();

    // Phase 5: Restore active plan if previously generated, and render Today view
    if (appData.planGenerated && appData.subjects.length > 0) {
      handleGenerateStudyPlan(false);
    }
    renderTodayView();

    // Preserved Phase 1 interactions & Phase 5 wire-ups
    initAppNavigation();
    initDateStripSelection();
    initDemonstrationActions();
  });
}

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
    appData.dailyHours = 4;
    appData.subjects = getDefaultDemoSubjects();
    appData.completedSessions = {};
    appData.completedUnits = {};
    appData.planGenerated = false;
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

      // Phase 5: Load completed sessions, completed units, and planGenerated flag
      appData.completedSessions = (parsed.completedSessions && typeof parsed.completedSessions === "object")
        ? parsed.completedSessions
        : {};
      appData.completedUnits = (parsed.completedUnits && typeof parsed.completedUnits === "object")
        ? parsed.completedUnits
        : {};
      appData.planGenerated = typeof parsed.planGenerated === "boolean" ? parsed.planGenerated : false;
    } else {
      throw new Error("Invalid root data shape in saved JSON");
    }
  } catch (error) {
    // Malformed JSON: warn and recover safely without crashing
    console.warn("StudyPlanner: Corrupted localStorage data encountered. Initializing defaults.", error);
    appData.dailyHours = 4;
    appData.subjects = getDefaultDemoSubjects();
    appData.completedSessions = {};
    appData.completedUnits = {};
    appData.planGenerated = false;
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

  // If a live plan is currently active, re-generate it to reflect the updated workload
  if (activePlan !== null) {
    handleGenerateStudyPlan(false);
  }

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

  // Clean up completed sessions and completed units associated with this subject
  if (appData.completedSessions) {
    for (const key in appData.completedSessions) {
      if (appData.completedSessions[key] && appData.completedSessions[key].subjectId === subjectId) {
        delete appData.completedSessions[key];
      }
    }
  }
  if (appData.completedUnits) {
    for (const uId in appData.completedUnits) {
      if (uId.startsWith(`${subjectId}-unit-`)) {
        delete appData.completedUnits[uId];
      }
    }
  }

  // Save changes and update display
  saveData();
  renderSubjects();

  // If a live plan is currently active, re-generate it to reflect the updated workload
  if (activePlan !== null || appData.planGenerated) {
    handleGenerateStudyPlan(false);
  } else {
    renderTodayView();
  }
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

        // If a live plan is currently active, re-generate it with the new daily capacity
        if (activePlan !== null) {
          handleGenerateStudyPlan(false);
        }
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

  // Phase 5: Re-sync views on navigation
  if (viewId === "view-today") {
    renderTodayView();
  } else if (viewId === "view-plan" && activePlan) {
    renderStudyPlan(activePlan);
  }

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
   7. Today Checklist Helpers (Phase 5 dynamic handling)
   ========================================================================== */

function initTaskChecklist() {
  // Backward compatibility stub; dynamic tasks are bound in renderTodayView()
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
    counterText.textContent = `${completedCount} of ${totalCount} sessions completed today`;
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
   8. Demonstration & Re-plan Triggers
   ========================================================================== */

function initDemonstrationActions() {
  const generatePlanBtn = document.getElementById("btn-generate-plan");

  if (generatePlanBtn) {
    generatePlanBtn.addEventListener("click", () => {
      handleGenerateStudyPlan(true);
    });
  }

  // Phase 5: Wire Re-plan button to live scheduling engine
  const replanBtn = document.getElementById("btn-replan");
  if (replanBtn) {
    replanBtn.addEventListener("click", () => {
      handleReplanSchedule();
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
        toggleEmptyStateBtn.querySelector("span").textContent = activePlan ? "Restore Live Schedule" : "Restore Sample Schedule";
      }
    });
  }
}

/* ==========================================================================
   9. Phase 3: Core Study Scheduling Algorithm & Workload Model
   ========================================================================== */

/**
 * Standard difficulty-to-study-hours mapping according to the project PRD:
 * - Easy:   1 required study hour per syllabus unit
 * - Medium: 2 required study hours per syllabus unit
 * - Hard:   3 required study hours per syllabus unit
 */
const DIFFICULTY_HOURS = {
  Easy: 1,
  Medium: 2,
  Hard: 3
};

/**
 * Returns the required study hours for a given difficulty level.
 * @param {string} difficulty - "Easy", "Medium", or "Hard"
 * @returns {number} Study hours required (defaults to 2 for Medium if unspecified)
 */
function getDifficultyHours(difficulty) {
  if (difficulty && typeof difficulty === "string" && DIFFICULTY_HOURS[difficulty]) {
    return DIFFICULTY_HOURS[difficulty];
  }
  return 2;
}

/**
 * Parses a "YYYY-MM-DD" local calendar date string into a Date object at midnight local time.
 * Avoiding UTC conversion preserves exact calendar dates regardless of the user's timezone.
 * @param {string} dateString - "YYYY-MM-DD"
 * @returns {Date}
 */
function parseLocalDate(dateString) {
  if (!dateString || typeof dateString !== "string") {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }
  const parts = dateString.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/**
 * Formats a Date object as a standard "YYYY-MM-DD" string in local time.
 * @param {Date} dateObj
 * @returns {string} "YYYY-MM-DD"
 */
function formatLocalDate(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns a new "YYYY-MM-DD" date string offset by a specified number of calendar days.
 * Pure function: does not mutate any caller arguments.
 * @param {string} dateString - "YYYY-MM-DD"
 * @param {number} daysToAdd - Integer number of days to offset
 * @returns {string} "YYYY-MM-DD"
 */
function addDaysToDate(dateString, daysToAdd) {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + daysToAdd);
  return formatLocalDate(date);
}

/**
 * Calculates whole calendar days between two "YYYY-MM-DD" dates (toDate - fromDate).
 * Uses Math.round to safely absorb daylight saving transitions (e.g. 23 or 25-hour days).
 * @param {string} fromDateString - "YYYY-MM-DD"
 * @param {string} toDateString - "YYYY-MM-DD"
 * @returns {number} Positive if toDate is in the future relative to fromDate
 */
function getDaysBetween(fromDateString, toDateString) {
  const d1 = parseLocalDate(fromDateString);
  const d2 = parseLocalDate(toDateString);
  const diffMs = d2.getTime() - d1.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calculates the scheduling urgency metric for an unfinished unit on a specific study day.
 * Formula: urgency = hoursLeft / daysUntilExam
 * If daysUntilExam <= 0, the exam is today or in the past (ineligible for study), returning 0.
 * @param {number} hoursLeft - Remaining study hours needed
 * @param {number} daysUntilExam - Calendar days until exam date (strictly > 0)
 * @returns {number}
 */
function calculateUrgency(hoursLeft, daysUntilExam) {
  if (daysUntilExam <= 0 || hoursLeft <= 0) {
    return 0;
  }
  return hoursLeft / daysUntilExam;
}

/**
 * Transforms an array of subject objects into individual schedulable unit items.
 * Each unit receives a stable ID, subject reference, exam date, and required study hours.
 * Pure function: does not mutate the original subject records.
 * 
 * @param {Array<Object>} subjects - Subject list from state/localStorage
 * @returns {Array<Object>} Array of individual schedulable units
 */
function buildSchedulableUnits(subjects) {
  if (!Array.isArray(subjects)) return [];

  const schedulableUnits = [];

  subjects.forEach((subject) => {
    const hoursPerUnit = getDifficultyHours(subject.difficulty);
    const unitList = Array.isArray(subject.units) ? subject.units : [];

    unitList.forEach((unitName, index) => {
      schedulableUnits.push({
        id: `${subject.id}-unit-${index + 1}`,
        subjectId: subject.id,
        subjectName: subject.name,
        subjectCode: subject.code || "",
        unitName: unitName,
        examDate: subject.examDate,
        difficulty: subject.difficulty || "Medium",
        requiredHours: hoursPerUnit,
        remainingHours: hoursPerUnit,
        completed: false
      });
    });
  });

  return schedulableUnits;
}

/**
 * Core Study Scheduling Algorithm:
 * Balances student workload across available revision days prior to examinations.
 * 
 * Algorithm Steps:
 * 1. Deep clone supplied units to ensure caller immutability & re-planning capability.
 * 2. Find the final relevant exam date and determine the last eligible study date.
 * 3. Iterate day-by-day starting from startDate up to the last eligible study date.
 * 4. On each day, calculate urgency (hoursLeft / daysUntilExam) for each unfinished unit with exam in the future.
 * 5. Sort eligible units descending by urgency (with stable tie-breaking).
 * 6. Allocate up to daily study hours, splitting a unit across days if necessary.
 * 7. Never schedule a session on or after a unit's exam date.
 * 8. Return the generated day-by-day plan, summary metrics, and any remaining at-risk units.
 * 
 * @param {Array<Object>} units - List of schedulable units
 * @param {string|Date} startDate - Schedule starting date (default: today's local date)
 * @param {number} hoursPerDay - Maximum study hours permitted per day (default: 4)
 * @returns {Object} { success, startDate, endDate, dailyHours, schedule, atRiskUnits, summary }
 */
function generatePlan(units, startDate, hoursPerDay, options = {}) {
  // Normalize startDate to a clean "YYYY-MM-DD" local calendar string
  let startDay;
  if (startDate instanceof Date) {
    startDay = formatLocalDate(startDate);
  } else if (typeof startDate === "string" && startDate.trim().length > 0) {
    startDay = startDate.trim();
  } else {
    startDay = formatLocalDate(new Date());
  }

  // Normalize daily hours capacity
  const dailyCapacity = typeof hoursPerDay === "number" && hoursPerDay > 0
    ? hoursPerDay
    : 4;

  // Handle empty workload gracefully
  if (!Array.isArray(units) || units.length === 0) {
    return {
      success: true,
      startDate: startDay,
      endDate: startDay,
      dailyHours: dailyCapacity,
      schedule: [],
      atRiskUnits: [],
      summary: {
        totalUnits: 0,
        completedUnits: 0,
        atRiskCount: 0,
        totalHoursNeeded: 0,
        totalHoursScheduled: 0,
        totalStudyDays: 0
      }
    };
  }

  // 1. Work on deep copies of supplied units to preserve original caller data
  const unitCopies = units.map((u, index) => {
    const requiredHours = typeof u.requiredHours === "number"
      ? u.requiredHours
      : getDifficultyHours(u.difficulty);

    const remainingHours = typeof u.remainingHours === "number"
      ? Math.max(0, u.remainingHours)
      : (u.completed ? 0 : requiredHours);

    return {
      id: u.id || `unit-${index + 1}`,
      subjectId: u.subjectId || "general",
      subjectName: u.subjectName || "",
      subjectCode: u.subjectCode || "",
      unitName: u.unitName || u.name || `Unit ${index + 1}`,
      examDate: u.examDate,
      difficulty: u.difficulty || "Medium",
      requiredHours: requiredHours,
      remainingHours: remainingHours,
      completed: remainingHours === 0
    };
  });

  // 2. Determine the final relevant exam date for unfinished units whose exam is in the future
  let maxExamDate = null;
  unitCopies.forEach((u) => {
    if (u.remainingHours > 0 && u.examDate && getDaysBetween(startDay, u.examDate) > 0) {
      if (!maxExamDate || u.examDate > maxExamDate) {
        maxExamDate = u.examDate;
      }
    }
  });

  // The last eligible study day across all units is the day strictly before the latest exam
  const lastEligibleStudyDate = maxExamDate ? addDaysToDate(maxExamDate, -1) : null;

  const schedule = [];
  let currentDate = startDay;

  // 3. Iterate through eligible study days
  if (lastEligibleStudyDate && currentDate <= lastEligibleStudyDate) {
    while (currentDate <= lastEligibleStudyDate) {
      // Early exit if all units have been completed
      const allFinished = unitCopies.every((u) => u.remainingHours <= 0);
      if (allFinished) {
        // If today has existing completed sessions, record them
        const existingSessions = (options.existingSessions && options.existingSessions[currentDate]) || [];
        if (existingSessions.length > 0) {
          schedule.push({
            date: currentDate,
            totalHours: Math.round(existingSessions.reduce((sum, s) => sum + s.hours, 0) * 100) / 100,
            sessions: existingSessions.map(s => ({ ...s }))
          });
        }
        break;
      }

      // Check if this date has pre-existing/completed sessions from options
      const existingSessions = (options.existingSessions && options.existingSessions[currentDate]) || [];
      const existingHours = (options.initialHoursUsed && options.initialHoursUsed[currentDate]) !== undefined
        ? options.initialHoursUsed[currentDate]
        : existingSessions.reduce((sum, s) => sum + s.hours, 0);

      let dailyHoursLeft = Math.max(0, Math.round((dailyCapacity - existingHours) * 100) / 100);
      const daySessions = existingSessions.map(s => ({ ...s }));

      // 4. Calculate urgency for each unfinished unit whose exam is still strictly in the future
      const eligibleUnits = [];
      for (const unit of unitCopies) {
        if (unit.remainingHours > 0 && unit.examDate) {
          const daysUntilExam = getDaysBetween(currentDate, unit.examDate);

          // Rule 7: Never schedule a unit on or after its exam date (daysUntilExam must be > 0)
          if (daysUntilExam > 0) {
            const urgency = calculateUrgency(unit.remainingHours, daysUntilExam);
            eligibleUnits.push({
              unitRef: unit,
              daysUntilExam: daysUntilExam,
              urgency: urgency
            });
          }
        }
      }

      // If no unfinished units can be scheduled on or after this date, but we have existing sessions for this date
      if (eligibleUnits.length === 0) {
        if (daySessions.length > 0) {
          schedule.push({
            date: currentDate,
            totalHours: Math.round(daySessions.reduce((sum, s) => sum + s.hours, 0) * 100) / 100,
            sessions: daySessions
          });
        }
        break;
      }

      // 5. Sort eligible units by urgency in descending order
      eligibleUnits.sort((a, b) => {
        // Primary: highest urgency first
        if (b.urgency !== a.urgency) {
          return b.urgency - a.urgency;
        }
        // Tie-breaker 1: earlier exam date comes first
        if (a.daysUntilExam !== b.daysUntilExam) {
          return a.daysUntilExam - b.daysUntilExam;
        }
        // Tie-breaker 2: stable deterministic comparison by unit ID
        return String(a.unitRef.id).localeCompare(String(b.unitRef.id));
      });

      // 6. Allocate up to available daily study hours, splitting a unit across days if necessary
      for (const item of eligibleUnits) {
        if (dailyHoursLeft <= 0) break;
        const unit = item.unitRef;
        if (unit.remainingHours <= 0) continue;

        const allocatedHours = Math.min(dailyHoursLeft, unit.remainingHours);
        if (allocatedHours > 0) {
          // Clean 2-decimal rounding to prevent floating-point inaccuracies
          const roundedAllocated = Math.round(allocatedHours * 100) / 100;

          daySessions.push({
            unitId: unit.id,
            subjectId: unit.subjectId,
            subjectName: unit.subjectName,
            subjectCode: unit.subjectCode,
            unitName: unit.unitName,
            hours: roundedAllocated,
            difficulty: unit.difficulty,
            examDate: unit.examDate,
            urgency: Math.round(item.urgency * 100) / 100
          });

          unit.remainingHours = Math.round((unit.remainingHours - roundedAllocated) * 100) / 100;
          dailyHoursLeft = Math.round((dailyHoursLeft - roundedAllocated) * 100) / 100;

          if (unit.remainingHours <= 0) {
            unit.remainingHours = 0;
            unit.completed = true;
          }
        }
      }

      // Record this day's study sessions
      if (daySessions.length > 0) {
        const dayTotalHours = Math.round(daySessions.reduce((sum, s) => sum + s.hours, 0) * 100) / 100;
        schedule.push({
          date: currentDate,
          totalHours: dayTotalHours,
          sessions: daySessions
        });
      }

      // Advance to the next calendar day
      currentDate = addDaysToDate(currentDate, 1);
    }
  } else if (options.existingSessions && options.existingSessions[currentDate] && options.existingSessions[currentDate].length > 0) {
    const existingSessions = options.existingSessions[currentDate];
    const dayTotalHours = Math.round(existingSessions.reduce((sum, s) => sum + s.hours, 0) * 100) / 100;
    schedule.push({
      date: currentDate,
      totalHours: dayTotalHours,
      sessions: existingSessions.map(s => ({ ...s }))
    });
  }

  // 8. Identify remaining at-risk units (units with remainingHours > 0)
  const atRiskUnits = unitCopies
    .filter((u) => u.remainingHours > 0)
    .map((u) => {
      let reason = "Insufficient daily study hours available before exam date";
      const daysFromStart = u.examDate ? getDaysBetween(startDay, u.examDate) : 0;
      if (daysFromStart <= 0) {
        reason = daysFromStart === 0
          ? "Exam is today; no study days available prior to exam"
          : "Exam date has already passed";
      }

      return {
        id: u.id,
        subjectId: u.subjectId,
        subjectName: u.subjectName,
        unitName: u.unitName,
        examDate: u.examDate,
        difficulty: u.difficulty,
        requiredHours: u.requiredHours,
        remainingHours: u.remainingHours,
        reason: reason
      };
    });

  // Calculate summary statistics
  const totalHoursNeeded = unitCopies.reduce((sum, u) => sum + u.requiredHours, 0);
  const totalHoursScheduled = schedule.reduce((sum, day) => sum + day.totalHours, 0);
  const completedCount = unitCopies.filter((u) => u.remainingHours === 0).length;

  return {
    success: atRiskUnits.length === 0,
    startDate: startDay,
    endDate: schedule.length > 0 ? schedule[schedule.length - 1].date : startDay,
    dailyHours: dailyCapacity,
    schedule: schedule,
    atRiskUnits: atRiskUnits,
    summary: {
      totalUnits: unitCopies.length,
      completedUnits: completedCount,
      atRiskCount: atRiskUnits.length,
      totalHoursNeeded: Math.round(totalHoursNeeded * 100) / 100,
      totalHoursScheduled: Math.round(totalHoursScheduled * 100) / 100,
      totalStudyDays: schedule.length
    }
  };
}

/* ==========================================================================
   10. Phase 4: Dynamic Study Plan Rendering & UI Integration
   ========================================================================== */

/**
 * Maps course card theme identifiers to matching badge CSS classes.
 * @param {string} theme - "os-theme", "cn-theme", "web-theme", etc.
 * @returns {string} CSS badge class
 */
function getThemeBadgeClass(theme) {
  if (theme === "os-theme") return "os-badge";
  if (theme === "cn-theme") return "cn-badge";
  if (theme === "web-theme") return "web-badge";
  if (theme === "warm-theme") return "warm-badge";
  if (theme === "teal-theme") return "teal-badge";
  return "badge-medium";
}

/**
 * Initializes the study plan engine trigger button.
 */
function initStudyPlanEngine() {
  if (typeof document === "undefined") return;
  const generatePlanBtn = document.getElementById("btn-generate-plan");
  if (generatePlanBtn) {
    generatePlanBtn.addEventListener("click", () => {
      handleGenerateStudyPlan(true);
    });
  }
}

/**
 * Builds schedulable units, runs generatePlan() on current data, and renders View B.
 * @param {boolean} autoScroll - Whether to scroll to the feedback banner in Setup
 */
function handleGenerateStudyPlan(autoScroll = false) {
  // 1. Build schedulable units from actual enrolled subjects, adjusting for completed units/sessions
  const rawUnits = buildSchedulableUnits(appData.subjects);
  const units = rawUnits.map((u) => {
    const completedHours = getCompletedHoursForUnit(u.id);
    const isDone = Boolean(appData.completedUnits && appData.completedUnits[u.id]) || (completedHours >= u.requiredHours);
    if (isDone) {
      return { ...u, remainingHours: 0, completed: true };
    }
    const remaining = Math.max(0, Math.round((u.requiredHours - completedHours) * 100) / 100);
    return { ...u, remainingHours: remaining, completed: remaining === 0 };
  });

  // 2. Read configured daily study hours from appData
  const dailyHours = typeof appData.dailyHours === "number" && appData.dailyHours > 0
    ? appData.dailyHours
    : 4;

  // 3. Current local calendar date as starting point
  const todayStr = formatLocalDate(new Date());

  // 4. Generate the real schedule
  activePlan = generatePlan(units, todayStr, dailyHours);
  appData.planGenerated = true;
  saveData();

  // 5. Render dynamically into Study Plan view (View B) and Today view (View C)
  if (typeof document !== "undefined") {
    renderStudyPlan(activePlan);
    renderTodayView();
    updateSetupFeedbackBanner(activePlan, autoScroll);
  }

  return activePlan;
}

/**
 * Updates the Setup view generation feedback banner with real statistics.
 * @param {Object} plan - Output of generatePlan()
 * @param {boolean} autoScroll - Whether to scroll into view
 */
function updateSetupFeedbackBanner(plan, autoScroll) {
  if (typeof document === "undefined") return;

  const feedbackBanner = document.getElementById("plan-generation-feedback");
  const feedbackIcon = feedbackBanner ? feedbackBanner.querySelector(".feedback-icon") : null;
  const feedbackText = feedbackBanner ? feedbackBanner.querySelector(".feedback-text") : null;
  const viewPlanBtn = document.getElementById("btn-view-generated-plan");

  if (!feedbackBanner) return;

  feedbackBanner.classList.remove("hidden");

  if (plan.schedule.length === 0) {
    feedbackBanner.className = "feedback-banner at-risk";
    if (feedbackIcon) feedbackIcon.textContent = "⚠";
    if (feedbackText) {
      if (appData.subjects.length === 0) {
        feedbackText.innerHTML = "<strong>No Subjects Registered:</strong> Please add courses and syllabus units above to generate a revision plan.";
      } else {
        feedbackText.innerHTML = "<strong>Exam Dates Overdue:</strong> All registered exams are today or in the past. To generate a revision timetable, select future exam dates.";
      }
    }
  } else if (!plan.success && plan.atRiskUnits.length > 0) {
    feedbackBanner.className = "feedback-banner at-risk";
    if (feedbackIcon) feedbackIcon.textContent = "⚠";
    if (feedbackText) {
      feedbackText.innerHTML = `<strong>Schedule Generated with Warnings:</strong> Generated <strong>${plan.summary.totalStudyDays} study days</strong> (${plan.summary.totalHoursScheduled} hrs). However, <strong>${plan.atRiskUnits.length} syllabus unit(s)</strong> are at risk because their exams occur too soon for your ${plan.dailyHours} hrs/day limit.`;
    }
  } else {
    feedbackBanner.className = "feedback-banner";
    if (feedbackIcon) feedbackIcon.textContent = "✓";
    if (feedbackText) {
      feedbackText.innerHTML = `<strong>Study Plan Generated!</strong> Successfully scheduled <strong>${plan.summary.totalUnits} units</strong> across <strong>${plan.summary.totalStudyDays} study days</strong> (${plan.summary.totalHoursScheduled} hrs total at ${plan.dailyHours} hrs/day).`;
    }
  }

  if (viewPlanBtn) {
    viewPlanBtn.textContent = "View Live Schedule →";
  }

  if (autoScroll) {
    feedbackBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

/**
 * Dynamically renders the generated schedule into View B (Study Plan).
 * Controls mode badges, at-risk warnings, empty states, date selector chips, and sessions.
 * @param {Object} plan - Output of generatePlan()
 */
function renderStudyPlan(plan) {
  if (typeof document === "undefined") return;

  const modeBadge = document.getElementById("plan-mode-badge");
  const previewBanner = document.getElementById("plan-preview-banner");
  const atRiskBanner = document.getElementById("plan-at-risk-banner");
  const atRiskSummaryText = document.getElementById("plan-at-risk-summary-text");
  const atRiskDetailContainer = document.getElementById("plan-at-risk-detail");
  const populatedContainer = document.getElementById("plan-populated-container");
  const emptyStateContainer = document.getElementById("plan-empty-state");
  const dateStrip = document.getElementById("date-strip");

  // 1. Update Schedule Mode badge (Live Schedule vs Sample Preview)
  if (modeBadge) {
    if (plan.schedule.length === 0) {
      modeBadge.textContent = "No Sessions";
      modeBadge.style.color = "var(--text-muted)";
    } else if (plan.atRiskUnits.length > 0) {
      modeBadge.textContent = `Live Schedule (${plan.atRiskUnits.length} At Risk)`;
      modeBadge.style.color = "#C05621";
    } else {
      modeBadge.textContent = `Live Schedule (${plan.summary.totalStudyDays} Days)`;
      modeBadge.style.color = "var(--primary-green)";
    }
  }

  // 2. Hide sample preview banner once a real plan is generated
  if (previewBanner) {
    previewBanner.classList.add("hidden");
  }

  // 3. Render At-Risk Warnings based on actual algorithm output
  if (atRiskBanner) {
    if (plan.atRiskUnits.length > 0) {
      atRiskBanner.removeAttribute("hidden");
      atRiskBanner.classList.remove("hidden");
      atRiskBanner.style.display = "flex";

      if (atRiskSummaryText) {
        atRiskSummaryText.textContent = `${plan.atRiskUnits.length} syllabus unit${plan.atRiskUnits.length === 1 ? "" : "s"} cannot be fully completed before exam date with ${plan.dailyHours} hrs/day target.`;
      }

      if (atRiskDetailContainer) {
        while (atRiskDetailContainer.firstChild) {
          atRiskDetailContainer.removeChild(atRiskDetailContainer.firstChild);
        }

        const introP = document.createElement("p");
        introP.className = "at-risk-detail-text";
        introP.textContent = "The revision workload exceeds the available study hours prior to examinations:";
        atRiskDetailContainer.appendChild(introP);

        const list = document.createElement("ul");
        list.className = "at-risk-units-list";

        plan.atRiskUnits.forEach((unit) => {
          const item = document.createElement("li");
          item.textContent = `${unit.subjectName || "Subject"} • ${unit.unitName} — Exam: ${formatDate(unit.examDate)} (${unit.remainingHours.toFixed(1)} of ${unit.requiredHours} hrs unallocated. ${unit.reason})`;
          list.appendChild(item);
        });
        atRiskDetailContainer.appendChild(list);

        const remedyP = document.createElement("p");
        remedyP.className = "at-risk-suggestion";
        remedyP.textContent = `Suggested Action: Increase your Daily Study Target in Setup (currently ${plan.dailyHours} hrs/day) or prioritize earlier examinations.`;
        atRiskDetailContainer.appendChild(remedyP);
      }
    } else {
      atRiskBanner.setAttribute("hidden", "true");
      atRiskBanner.classList.add("hidden");
      atRiskBanner.style.display = "none";
    }
  }

  // 4. Empty State vs Populated Container
  if (plan.schedule.length === 0) {
    if (populatedContainer) populatedContainer.style.display = "none";
    if (emptyStateContainer) {
      emptyStateContainer.classList.remove("hidden");
      const emptyTitle = emptyStateContainer.querySelector(".empty-state-title");
      const emptyDesc = emptyStateContainer.querySelector(".empty-state-description");

      if (appData.subjects.length === 0) {
        if (emptyTitle) emptyTitle.textContent = "No Subjects Registered";
        if (emptyDesc) emptyDesc.textContent = "Your study schedule is empty because you have no registered courses. Add your subjects in Setup to generate a plan.";
      } else {
        if (emptyTitle) emptyTitle.textContent = "No Eligible Study Sessions";
        if (emptyDesc) emptyDesc.textContent = "All registered courses have exam dates scheduled for today or in the past. To build a revision timetable, exam dates must be tomorrow or later.";
      }
    }
    return;
  }

  if (emptyStateContainer) emptyStateContainer.classList.add("hidden");
  if (populatedContainer) populatedContainer.style.display = "block";

  // 5. Build dynamic horizontal date strip
  if (dateStrip) {
    while (dateStrip.firstChild) {
      dateStrip.removeChild(dateStrip.firstChild);
    }

    const availableDates = plan.schedule.map((d) => d.date);
    if (!selectedPlanDate || !availableDates.includes(selectedPlanDate)) {
      selectedPlanDate = availableDates[0];
    }

    plan.schedule.forEach((dayData) => {
      const chip = document.createElement("button");
      chip.type = "button";
      const isSelected = dayData.date === selectedPlanDate;
      chip.className = isSelected ? "date-chip active" : "date-chip";
      chip.setAttribute("role", "tab");
      chip.setAttribute("aria-selected", isSelected ? "true" : "false");
      chip.setAttribute("data-date", dayData.date);

      const dateObj = parseLocalDate(dayData.date);
      const dayShortStr = dateObj.toLocaleDateString("en-US", { weekday: "short" });
      const dayNumStr = dateObj.toLocaleDateString("en-US", { day: "numeric" });
      const monthShortStr = dateObj.toLocaleDateString("en-US", { month: "short" });

      const dayShortSpan = document.createElement("span");
      dayShortSpan.className = "day-short";
      dayShortSpan.textContent = dayShortStr;

      const dayNumSpan = document.createElement("span");
      dayNumSpan.className = "day-number";
      dayNumSpan.textContent = dayNumStr;

      const monthShortSpan = document.createElement("span");
      monthShortSpan.className = "month-short";
      monthShortSpan.textContent = monthShortStr;

      const dotSpan = document.createElement("span");
      dotSpan.className = "session-dot";
      const sessionWord = dayData.sessions.length === 1 ? "session" : "sessions";
      dotSpan.title = `${dayData.sessions.length} ${sessionWord} (${dayData.totalHours} hrs)`;

      chip.appendChild(dayShortSpan);
      chip.appendChild(dayNumSpan);
      chip.appendChild(monthShortSpan);
      chip.appendChild(dotSpan);

      chip.addEventListener("click", () => {
        const allChips = dateStrip.querySelectorAll(".date-chip");
        allChips.forEach((c) => {
          c.classList.remove("active");
          c.setAttribute("aria-selected", "false");
        });
        chip.classList.add("active");
        chip.setAttribute("aria-selected", "true");
        selectedPlanDate = dayData.date;
        renderPlanDaySessions(plan, dayData.date);
      });

      dateStrip.appendChild(chip);
    });
  }

  // 6. Render sessions for currently selected date
  renderPlanDaySessions(plan, selectedPlanDate);
}

/**
 * Renders the session cards and header details for a chosen date in the active plan.
 * @param {Object} plan
 * @param {string} dateString - "YYYY-MM-DD"
 */
function renderPlanDaySessions(plan, dateString) {
  if (typeof document === "undefined") return;

  const dayData = plan.schedule.find((d) => d.date === dateString);
  const headingElem = document.getElementById("selected-date-title");
  const statSessionsElem = document.getElementById("stat-pill-sessions");
  const statHoursElem = document.getElementById("stat-pill-hours");
  const sessionGrid = document.getElementById("session-cards-grid");

  if (!dayData || !sessionGrid) return;

  // Format header title
  const dateObj = parseLocalDate(dateString);
  const formattedTitle = dateObj.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  if (headingElem) {
    headingElem.textContent = `Schedule for ${formattedTitle}`;
  }

  if (statSessionsElem) {
    const sessionWord = dayData.sessions.length === 1 ? "Session" : "Sessions";
    statSessionsElem.textContent = `${dayData.sessions.length} ${sessionWord}`;
  }

  if (statHoursElem) {
    statHoursElem.textContent = `${dayData.totalHours.toFixed(1)} Hours Total`;
  }

  // Clear previous session cards safely
  while (sessionGrid.firstChild) {
    sessionGrid.removeChild(sessionGrid.firstChild);
  }

  if (dayData.sessions.length === 0) {
    const emptyDayDiv = document.createElement("div");
    emptyDayDiv.className = "empty-day-session";
    emptyDayDiv.textContent = "No study sessions scheduled for this date.";
    sessionGrid.appendChild(emptyDayDiv);
    return;
  }

  // Render each session card
  dayData.sessions.forEach((session, index) => {
    const subject = appData.subjects.find((s) => s.id === session.subjectId);
    const theme = subject ? (subject.theme || "os-theme") : "os-theme";
    const code = subject && subject.code ? subject.code : "";

    const sessionKey = `${dateString}_${session.unitId}`;
    const isCompleted = Boolean(appData.completedSessions && appData.completedSessions[sessionKey]);

    const card = document.createElement("article");
    card.className = isCompleted ? `session-card ${theme} completed-session` : `session-card ${theme}`;

    // Time Column
    const timeCol = document.createElement("div");
    timeCol.className = "session-time-col";

    const blockSpan = document.createElement("span");
    blockSpan.className = "session-start";
    blockSpan.textContent = `Block ${index + 1}`;

    const durSpan = document.createElement("span");
    durSpan.className = "session-duration";
    durSpan.textContent = `${session.hours.toFixed(1)} hrs`;

    const slotSpan = document.createElement("span");
    slotSpan.className = "session-slot";
    slotSpan.textContent = "Study Target";

    timeCol.appendChild(blockSpan);
    timeCol.appendChild(durSpan);
    timeCol.appendChild(slotSpan);

    // Session Body
    const bodyDiv = document.createElement("div");
    bodyDiv.className = "session-body";

    // Header: Subject badge + difficulty & urgency (+ completed indicator)
    const headerDiv = document.createElement("div");
    headerDiv.className = "session-header";

    const subjectBadge = document.createElement("span");
    subjectBadge.className = `subject-badge ${getThemeBadgeClass(theme)}`;
    subjectBadge.textContent = session.subjectName || "Subject";

    const statusBadge = document.createElement("span");
    statusBadge.className = "session-status-badge";
    statusBadge.textContent = `Difficulty: ${session.difficulty} • Urgency: ${session.urgency.toFixed(2)}`;

    headerDiv.appendChild(subjectBadge);
    headerDiv.appendChild(statusBadge);

    if (isCompleted) {
      const compBadge = document.createElement("span");
      compBadge.className = "badge badge-success-sm";
      compBadge.textContent = "✓ Completed";
      headerDiv.appendChild(compBadge);
    }

    // Unit Name Heading
    const unitHeading = document.createElement("h4");
    unitHeading.className = "session-unit-name";
    unitHeading.textContent = session.unitName;

    // Session Notes
    const notesP = document.createElement("p");
    notesP.className = "session-notes";
    const hourWord = session.hours === 1 ? "hour" : "hours";
    notesP.textContent = `Allocated ${session.hours.toFixed(1)} ${hourWord} of focused study for this syllabus unit. Examination date: ${formatDate(session.examDate)}.`;

    // Footer items
    const footerDiv = document.createElement("div");
    footerDiv.className = "session-footer";

    const minItem = document.createElement("span");
    minItem.className = "session-detail-item";
    minItem.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${Math.round(session.hours * 60)} Minutes`;

    const examItem = document.createElement("span");
    examItem.className = "session-detail-item";
    examItem.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg> Exam: ${formatDate(session.examDate)}`;

    footerDiv.appendChild(minItem);
    footerDiv.appendChild(examItem);

    if (code) {
      const codeItem = document.createElement("span");
      codeItem.className = "session-detail-item";
      codeItem.textContent = code;
      footerDiv.appendChild(codeItem);
    }

    bodyDiv.appendChild(headerDiv);
    bodyDiv.appendChild(unitHeading);
    bodyDiv.appendChild(notesP);
    bodyDiv.appendChild(footerDiv);

    card.appendChild(timeCol);
    card.appendChild(bodyDiv);

    sessionGrid.appendChild(card);
  });
}

/* ==========================================================================
   11. Phase 5: Completion Tracking, Progress Display & Dynamic Re-planning
   ========================================================================== */

/**
 * Maps course theme identifiers to checkbox/subject tag CSS classes.
 * @param {string} theme - "os-theme", "cn-theme", "web-theme", etc.
 * @returns {string} CSS tag class
 */
function getThemeTagClass(theme) {
  if (theme === "os-theme") return "os-tag";
  if (theme === "cn-theme") return "cn-tag";
  if (theme === "web-theme") return "web-tag";
  if (theme === "warm-theme") return "warm-tag";
  if (theme === "teal-theme") return "teal-tag";
  return "os-tag";
}

/**
 * Maps course theme identifiers to color dot CSS classes.
 * @param {string} theme - "os-theme", "cn-theme", "web-theme", etc.
 * @returns {string} CSS dot class
 */
function getThemeDotClass(theme) {
  if (theme === "os-theme") return "os-dot";
  if (theme === "cn-theme") return "cn-dot";
  if (theme === "web-theme") return "web-dot";
  if (theme === "warm-theme") return "warm-dot";
  if (theme === "teal-theme") return "teal-dot";
  return "os-dot";
}

/**
 * Maps course theme identifiers to progress fill CSS classes.
 * @param {string} theme - "os-theme", "cn-theme", "web-theme", etc.
 * @returns {string} CSS fill class
 */
function getThemeFillClass(theme) {
  if (theme === "os-theme") return "os-fill";
  if (theme === "cn-theme") return "cn-fill";
  if (theme === "web-theme") return "web-fill";
  if (theme === "warm-theme") return "warm-fill";
  if (theme === "teal-theme") return "teal-fill";
  return "os-fill";
}

/**
 * Calculates total completed study hours for a specific syllabus unit across all sessions.
 * @param {string} unitId 
 * @returns {number}
 */
function getCompletedHoursForUnit(unitId) {
  if (!appData.completedSessions) return 0;
  let total = 0;
  for (const key in appData.completedSessions) {
    const item = appData.completedSessions[key];
    if (item && item.unitId === unitId) {
      total += (typeof item.hours === "number" ? item.hours : 0);
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * Checks whether a unit is considered completely finished.
 * @param {Object} unit - Schedulable unit or { id, requiredHours }
 * @returns {boolean}
 */
function isUnitCompleted(unit) {
  if (!unit || !unit.id) return false;
  if (appData.completedUnits && appData.completedUnits[unit.id] === true) {
    return true;
  }
  const completedHours = getCompletedHoursForUnit(unit.id);
  const required = typeof unit.requiredHours === "number" ? unit.requiredHours : 0;
  return required > 0 && completedHours >= required;
}

/**
 * Recalculates appData.completedUnits based on cumulative completed session hours.
 */
function updateUnitsCompletionStatus() {
  if (!appData.completedUnits) appData.completedUnits = {};
  const allUnits = buildSchedulableUnits(appData.subjects);

  allUnits.forEach((unit) => {
    const completedHours = getCompletedHoursForUnit(unit.id);
    if (completedHours >= unit.requiredHours && unit.requiredHours > 0) {
      appData.completedUnits[unit.id] = true;
    } else if (appData.completedUnits[unit.id] && completedHours < unit.requiredHours) {
      delete appData.completedUnits[unit.id];
    }
  });
}

/**
 * Toggles a session's completion status, updates progress, and persists in localStorage.
 * @param {string} sessionKey - "${date}_${unitId}"
 * @param {boolean} isChecked
 */
function toggleSessionCompletion(sessionKey, isChecked) {
  if (!appData.completedSessions) appData.completedSessions = {};
  if (!appData.completedUnits) appData.completedUnits = {};

  if (isChecked) {
    // Look up session details from activePlan or extract from sessionKey
    let sessionObj = null;
    if (activePlan && Array.isArray(activePlan.schedule)) {
      for (const day of activePlan.schedule) {
        const found = day.sessions.find(s => `${day.date}_${s.unitId}` === sessionKey);
        if (found) {
          sessionObj = {
            unitId: found.unitId,
            subjectId: found.subjectId,
            hours: found.hours,
            date: day.date,
            completed: true,
            completedAt: new Date().toISOString()
          };
          break;
        }
      }
    }
    if (!sessionObj) {
      const parts = sessionKey.split("_");
      const datePart = parts[0];
      const unitPart = parts.slice(1).join("_");
      const allUnits = buildSchedulableUnits(appData.subjects);
      const matchedUnit = allUnits.find(u => u.id === unitPart);
      sessionObj = {
        unitId: unitPart,
        subjectId: matchedUnit ? matchedUnit.subjectId : "",
        date: datePart,
        hours: matchedUnit ? matchedUnit.requiredHours : 1,
        completed: true,
        completedAt: new Date().toISOString()
      };
    }
    appData.completedSessions[sessionKey] = sessionObj;
  } else {
    delete appData.completedSessions[sessionKey];
  }

  // Update completedUnits map
  updateUnitsCompletionStatus();

  // Persist state in localStorage
  saveData();

  // Re-render Today view
  renderTodayView();

  // If Study Plan view is currently active, re-render it too
  if (activePlan && typeof document !== "undefined") {
    const viewPlan = document.getElementById("view-plan");
    if (viewPlan && !viewPlan.hidden) {
      renderStudyPlan(activePlan);
    }
  }
}

/**
 * Renders View C (Today) dynamically from the live plan, completion data, and subject stats.
 */
function renderTodayView() {
  if (typeof document === "undefined") return;

  const todayStr = formatLocalDate(new Date());

  // 1. Format date badge
  const todayDateElem = document.getElementById("today-date-text");
  if (todayDateElem) {
    const now = new Date();
    todayDateElem.textContent = now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  }

  const taskList = document.getElementById("today-task-rows-list");
  const counterText = document.getElementById("task-counter-text");
  const completionBadge = document.getElementById("day-completion-badge");

  if (!taskList) return;

  // Clear existing task list
  while (taskList.firstChild) {
    taskList.removeChild(taskList.firstChild);
  }

  // 2. Find today's sessions in activePlan
  let todayDayData = null;
  if (activePlan && Array.isArray(activePlan.schedule)) {
    todayDayData = activePlan.schedule.find(day => day.date === todayStr);
  }

  const todaySessions = todayDayData ? todayDayData.sessions : [];

  // 3. Render Empty State vs Task Rows
  if (todaySessions.length === 0) {
    const emptyContainer = document.createElement("div");
    emptyContainer.className = "empty-today-tasks";

    const iconDiv = document.createElement("div");
    iconDiv.className = "empty-today-icon";
    iconDiv.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>`;

    const titleDiv = document.createElement("div");
    titleDiv.className = "empty-today-title";

    const descP = document.createElement("p");
    descP.className = "empty-today-desc";

    if (!activePlan || !appData.planGenerated) {
      titleDiv.textContent = "No Schedule Generated Yet";
      descP.textContent = "Generate your study plan from the Setup or Study Plan tab to populate today's revision targets and track your daily progress.";
    } else {
      titleDiv.textContent = "No Study Sessions Scheduled for Today";
      descP.textContent = "You have no study commitments scheduled for today. Check the Study Plan tab to review upcoming study days or re-plan sessions.";
    }

    emptyContainer.appendChild(iconDiv);
    emptyContainer.appendChild(titleDiv);
    emptyContainer.appendChild(descP);
    taskList.appendChild(emptyContainer);

    if (counterText) {
      counterText.textContent = "0 sessions scheduled for today";
    }
    if (completionBadge) {
      completionBadge.textContent = "No Sessions";
      completionBadge.style.backgroundColor = "var(--bg-surface-warm)";
      completionBadge.style.color = "var(--text-secondary)";
    }
  } else {
    // Render session rows with checkboxes
    let completedCount = 0;

    todaySessions.forEach((session) => {
      const sessionKey = `${todayStr}_${session.unitId}`;
      const isCompleted = Boolean(appData.completedSessions && appData.completedSessions[sessionKey]);
      if (isCompleted) completedCount++;

      const subject = appData.subjects.find(s => s.id === session.subjectId);
      const theme = subject ? (subject.theme || "os-theme") : "os-theme";
      const tagClass = getThemeTagClass(theme);

      const row = document.createElement("div");
      row.className = isCompleted ? "task-row completed" : "task-row";
      row.id = `task-row-${sessionKey}`;

      const label = document.createElement("label");
      label.className = "task-checkbox-label";
      label.setAttribute("for", `task-chk-${sessionKey}`);

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "task-checkbox";
      checkbox.id = `task-chk-${sessionKey}`;
      checkbox.setAttribute("data-session-key", sessionKey);
      checkbox.checked = isCompleted;

      checkbox.addEventListener("change", (e) => {
        toggleSessionCompletion(sessionKey, e.target.checked);
      });

      const checkmark = document.createElement("span");
      checkmark.className = "custom-checkmark";
      checkmark.setAttribute("aria-hidden", "true");

      const detailsDiv = document.createElement("div");
      detailsDiv.className = "task-details";

      const topMeta = document.createElement("div");
      topMeta.className = "task-top-meta";

      const subjectTag = document.createElement("span");
      subjectTag.className = `task-subject-tag ${tagClass}`;
      subjectTag.textContent = session.subjectName || "Subject";

      const timeEstimate = document.createElement("span");
      timeEstimate.className = "task-time-estimate";
      timeEstimate.textContent = `${session.hours.toFixed(1)} hrs`;

      topMeta.appendChild(subjectTag);
      topMeta.appendChild(timeEstimate);

      const titleSpan = document.createElement("span");
      titleSpan.className = "task-title";
      titleSpan.textContent = session.unitName;

      const subtextSpan = document.createElement("span");
      subtextSpan.className = "task-subtext";
      subtextSpan.textContent = `Exam: ${formatDate(session.examDate)} • Difficulty: ${session.difficulty}`;

      detailsDiv.appendChild(topMeta);
      detailsDiv.appendChild(titleSpan);
      detailsDiv.appendChild(subtextSpan);

      label.appendChild(checkbox);
      label.appendChild(checkmark);
      label.appendChild(detailsDiv);

      row.appendChild(label);
      taskList.appendChild(row);
    });

    // Update counter & badge
    if (counterText) {
      counterText.textContent = `${completedCount} of ${todaySessions.length} sessions completed today`;
    }
    if (completionBadge) {
      if (completedCount === todaySessions.length && todaySessions.length > 0) {
        completionBadge.textContent = "All Done!";
        completionBadge.style.backgroundColor = "var(--sage-soft)";
        completionBadge.style.color = "var(--primary-green)";
      } else if (completedCount > 0) {
        completionBadge.textContent = "In Progress";
        completionBadge.style.backgroundColor = "var(--bg-surface-warm)";
        completionBadge.style.color = "var(--text-secondary)";
      } else {
        completionBadge.textContent = "Not Started";
        completionBadge.style.backgroundColor = "var(--bg-surface-warm)";
        completionBadge.style.color = "var(--text-secondary)";
      }
    }
  }

  // 4. Update At-Risk Banner in Today view
  const atRiskBanner = document.getElementById("today-at-risk-banner");
  const atRiskHeadline = document.getElementById("today-at-risk-headline");
  const atRiskDetailContainer = document.getElementById("today-at-risk-detail-container");

  if (atRiskBanner) {
    if (activePlan && activePlan.atRiskUnits && activePlan.atRiskUnits.length > 0) {
      atRiskBanner.removeAttribute("hidden");
      atRiskBanner.classList.remove("hidden");
      atRiskBanner.style.display = "flex";

      if (atRiskHeadline) {
        atRiskHeadline.innerHTML = `<strong>At-Risk Schedule Warning:</strong> ${activePlan.atRiskUnits.length} syllabus unit${activePlan.atRiskUnits.length === 1 ? "" : "s"} cannot be fully completed before exam date.`;
      }
      if (atRiskDetailContainer) {
        while (atRiskDetailContainer.firstChild) {
          atRiskDetailContainer.removeChild(atRiskDetailContainer.firstChild);
        }
        const p = document.createElement("p");
        p.className = "at-risk-detail";
        p.textContent = activePlan.atRiskUnits.map(u => `${u.subjectName} (${u.unitName})`).join(", ") + ". We recommend increasing daily hours or prioritizing earlier exams.";
        atRiskDetailContainer.appendChild(p);
      }
    } else {
      atRiskBanner.setAttribute("hidden", "true");
      atRiskBanner.classList.add("hidden");
      atRiskBanner.style.display = "none";
    }
  }

  // 5. Render Subject-wise Progress Bars
  renderSubjectProgressBars();

  // 6. Render Quick Metrics
  renderQuickMetrics();
}

/**
 * Calculates and dynamically renders subject-wise progress bars and counters.
 */
function renderSubjectProgressBars() {
  const container = document.getElementById("progress-bars-container");
  const subtext = document.getElementById("progress-card-subtext");
  if (!container) return;

  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  if (appData.subjects.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "empty-day-session";
    emptyMsg.textContent = "No subjects registered. Add subjects in Setup to view progress.";
    container.appendChild(emptyMsg);
    if (subtext) subtext.textContent = "No courses registered";
    return;
  }

  if (subtext) {
    const subjWord = appData.subjects.length === 1 ? "course" : "courses";
    subtext.textContent = `Live completion across ${appData.subjects.length} registered ${subjWord}`;
  }

  appData.subjects.forEach((subject) => {
    const hoursPerUnit = getDifficultyHours(subject.difficulty);
    const unitList = Array.isArray(subject.units) ? subject.units : [];
    const totalUnits = unitList.length;
    const totalRequiredHours = totalUnits * hoursPerUnit;

    let completedHours = 0;
    let completedUnitsCount = 0;

    unitList.forEach((_, idx) => {
      const unitId = `${subject.id}-unit-${idx + 1}`;
      const unitCompletedHours = Math.min(hoursPerUnit, getCompletedHoursForUnit(unitId));
      completedHours += unitCompletedHours;
      if (appData.completedUnits && appData.completedUnits[unitId]) {
        completedUnitsCount++;
      } else if (unitCompletedHours >= hoursPerUnit && hoursPerUnit > 0) {
        completedUnitsCount++;
      }
    });

    const percent = totalRequiredHours > 0
      ? Math.min(100, Math.round((completedHours / totalRequiredHours) * 100))
      : 0;

    const theme = subject.theme || "os-theme";
    const dotClass = getThemeDotClass(theme);
    const fillClass = getThemeFillClass(theme);

    const itemDiv = document.createElement("div");
    itemDiv.className = "progress-item";

    const infoRow = document.createElement("div");
    infoRow.className = "progress-info-row";

    const titleWrap = document.createElement("div");
    titleWrap.className = "progress-title-wrap";

    const dotSpan = document.createElement("span");
    dotSpan.className = `color-dot ${dotClass}`;
    dotSpan.setAttribute("aria-hidden", "true");

    const subjectSpan = document.createElement("span");
    subjectSpan.className = "progress-subject";
    subjectSpan.textContent = subject.name;

    titleWrap.appendChild(dotSpan);
    titleWrap.appendChild(subjectSpan);

    // Subject status badge
    const isAtRisk = activePlan && activePlan.atRiskUnits && activePlan.atRiskUnits.some(u => u.subjectId === subject.id);
    if (percent === 100) {
      const badge = document.createElement("span");
      badge.className = "badge-success-sm";
      badge.textContent = "Completed";
      titleWrap.appendChild(badge);
    } else if (isAtRisk) {
      const badge = document.createElement("span");
      badge.className = "badge-warning-sm";
      badge.textContent = "At-Risk";
      titleWrap.appendChild(badge);
    } else if (percent > 0) {
      const badge = document.createElement("span");
      badge.className = "badge-success-sm";
      badge.textContent = "On Track";
      titleWrap.appendChild(badge);
    }

    const fractionSpan = document.createElement("span");
    fractionSpan.className = "progress-fraction";
    const unitWord = totalUnits === 1 ? "Unit" : "Units";
    fractionSpan.textContent = `${completedUnitsCount} of ${totalUnits} ${unitWord} (${percent}%)`;

    infoRow.appendChild(titleWrap);
    infoRow.appendChild(fractionSpan);

    const trackDiv = document.createElement("div");
    trackDiv.className = "progress-track";
    trackDiv.setAttribute("role", "progressbar");
    trackDiv.setAttribute("aria-valuenow", String(percent));
    trackDiv.setAttribute("aria-valuemin", "0");
    trackDiv.setAttribute("aria-valuemax", "100");
    trackDiv.setAttribute("aria-label", `${subject.name} Progress`);

    const fillDiv = document.createElement("div");
    fillDiv.className = `progress-fill ${fillClass}`;
    fillDiv.style.width = `${percent}%`;

    trackDiv.appendChild(fillDiv);

    itemDiv.appendChild(infoRow);
    itemDiv.appendChild(trackDiv);

    container.appendChild(itemDiv);
  });
}

/**
 * Calculates and dynamically renders prep health summary metrics.
 */
function renderQuickMetrics() {
  const metricTodayHours = document.getElementById("metric-today-hours");
  const metricTodayHoursLabel = document.getElementById("metric-today-hours-label");
  const metricDaysToExam = document.getElementById("metric-days-to-exam");
  const metricDaysToExamLabel = document.getElementById("metric-days-to-exam-label");
  const metricTotalUnits = document.getElementById("metric-total-units");
  const metricTotalUnitsLabel = document.getElementById("metric-total-units-label");
  const metricCoverage = document.getElementById("metric-aggregate-coverage");
  const metricCoverageLabel = document.getElementById("metric-aggregate-coverage-label");

  // 1. Today's hours
  const todayStr = formatLocalDate(new Date());
  let todayHours = 0;
  if (activePlan && Array.isArray(activePlan.schedule)) {
    const todayDayData = activePlan.schedule.find(d => d.date === todayStr);
    if (todayDayData) todayHours = todayDayData.totalHours;
  }
  if (metricTodayHours) {
    metricTodayHours.textContent = todayHours.toFixed(1);
  }
  if (metricTodayHoursLabel) {
    metricTodayHoursLabel.textContent = `Hours Assigned Today (Target: ${appData.dailyHours.toFixed(1)} hrs)`;
  }

  // 2. Days to first exam
  let earliestDate = null;
  let earliestDays = Infinity;
  appData.subjects.forEach((subject) => {
    if (subject.examDate) {
      const days = getDaysRemaining(subject.examDate);
      if (days >= 0 && days < earliestDays) {
        earliestDays = days;
        earliestDate = subject.examDate;
      }
    }
  });

  if (metricDaysToExam) {
    metricDaysToExam.textContent = earliestDate ? String(earliestDays) : "-";
  }
  if (metricDaysToExamLabel) {
    metricDaysToExamLabel.textContent = earliestDate
      ? `Days to First Exam (${formatDate(earliestDate)})`
      : "Days to First Exam (None set)";
  }

  // 3. Total units
  const totalUnits = appData.subjects.reduce((sum, s) => sum + (Array.isArray(s.units) ? s.units.length : 0), 0);
  if (metricTotalUnits) {
    metricTotalUnits.textContent = String(totalUnits);
  }
  if (metricTotalUnitsLabel) {
    const subjWord = appData.subjects.length === 1 ? "Subject" : "Subjects";
    const unitWord = totalUnits === 1 ? "Unit" : "Units";
    metricTotalUnitsLabel.textContent = `Total Syllabus Units (${totalUnits} ${unitWord}, ${appData.subjects.length} ${subjWord})`;
  }

  // 4. Aggregate Coverage
  const allUnits = buildSchedulableUnits(appData.subjects);
  const totalRequiredHours = allUnits.reduce((sum, u) => sum + u.requiredHours, 0);
  let totalCompletedHours = 0;
  allUnits.forEach((u) => {
    totalCompletedHours += Math.min(u.requiredHours, getCompletedHoursForUnit(u.id));
  });

  const coveragePercent = totalRequiredHours > 0
    ? Math.round((totalCompletedHours / totalRequiredHours) * 100)
    : 0;

  if (metricCoverage) {
    metricCoverage.textContent = `${coveragePercent}%`;
  }
  if (metricCoverageLabel) {
    metricCoverageLabel.textContent = `Aggregate Coverage (${totalCompletedHours.toFixed(1)}/${totalRequiredHours.toFixed(1)} hrs)`;
  }
}

/**
 * Re-plans unfinished work starting from the current local calendar date.
 * Excludes completed work, respects daily study hours and exam deadlines,
 * displays warnings for at-risk units, and leaves original subject records unmutated.
 */
function handleReplanSchedule() {
  const todayStr = formatLocalDate(new Date());

  // 1. Build fresh schedulable units from subjects without mutating appData.subjects
  const rawUnits = buildSchedulableUnits(appData.subjects);

  // 2. Adjust remaining hours and completed status based on recorded completions
  const unitsForReplan = rawUnits.map((u) => {
    const completedHours = getCompletedHoursForUnit(u.id);
    const isDone = Boolean(appData.completedUnits && appData.completedUnits[u.id]) || (completedHours >= u.requiredHours);

    if (isDone) {
      return {
        ...u,
        remainingHours: 0,
        completed: true
      };
    } else {
      const remaining = Math.max(0, Math.round((u.requiredHours - completedHours) * 100) / 100);
      return {
        ...u,
        remainingHours: remaining,
        completed: remaining === 0
      };
    }
  });

  // 3. Find any sessions completed on today's date to preserve in today's entry
  const completedTodaySessions = [];
  if (appData.completedSessions) {
    for (const key in appData.completedSessions) {
      const item = appData.completedSessions[key];
      if (item && item.date === todayStr) {
        const rawUnit = rawUnits.find(u => u.id === item.unitId);
        completedTodaySessions.push({
          unitId: item.unitId,
          subjectId: item.subjectId || (rawUnit ? rawUnit.subjectId : ""),
          subjectName: rawUnit ? rawUnit.subjectName : "",
          subjectCode: rawUnit ? rawUnit.subjectCode : "",
          unitName: rawUnit ? rawUnit.unitName : "",
          hours: item.hours || 0,
          difficulty: rawUnit ? rawUnit.difficulty : "Medium",
          examDate: rawUnit ? rawUnit.examDate : "",
          urgency: 0,
          isCompleted: true
        });
      }
    }
  }

  const completedTodayHours = completedTodaySessions.reduce((sum, s) => sum + s.hours, 0);

  // 4. Run generatePlan from today's date with options
  const planOptions = {
    initialHoursUsed: { [todayStr]: completedTodayHours },
    existingSessions: { [todayStr]: completedTodaySessions }
  };

  const newPlan = generatePlan(unitsForReplan, todayStr, appData.dailyHours, planOptions);

  activePlan = newPlan;
  appData.planGenerated = true;
  saveData();

  // 5. Update UI
  if (typeof document !== "undefined") {
    renderStudyPlan(newPlan);
    renderTodayView();

    // Show Re-plan Feedback Banner
    const feedbackBanner = document.getElementById("replan-demo-feedback");
    const feedbackIcon = document.getElementById("replan-feedback-icon");
    const feedbackText = document.getElementById("replan-feedback-text");
    const viewPlanBtn = document.getElementById("btn-replan-view-plan");

    if (feedbackBanner) {
      feedbackBanner.removeAttribute("hidden");
      feedbackBanner.classList.remove("hidden");
      feedbackBanner.style.display = "flex";

      if (newPlan.schedule.length === 0) {
        if (feedbackIcon) feedbackIcon.textContent = "✓";
        if (feedbackText) {
          feedbackText.innerHTML = "<strong>All Caught Up!</strong> All syllabus units across your courses have been completed or no pending units need rescheduling.";
        }
      } else if (!newPlan.success && newPlan.atRiskUnits.length > 0) {
        if (feedbackIcon) feedbackIcon.textContent = "⚠";
        if (feedbackText) {
          feedbackText.innerHTML = `<strong>Re-plan Warning:</strong> Remaining work rescheduled from today (${todayStr}). <strong>${newPlan.atRiskUnits.length} syllabus unit(s)</strong> are at risk because their exams occur too soon.`;
        }
      } else {
        if (feedbackIcon) feedbackIcon.textContent = "✓";
        if (feedbackText) {
          feedbackText.innerHTML = `<strong>Schedule Re-planned!</strong> Unfinished workload successfully redistributed starting from today (${todayStr}) across <strong>${newPlan.schedule.length} study days</strong> (${newPlan.summary.totalHoursScheduled} hrs).`;
        }
      }

      if (viewPlanBtn) {
        viewPlanBtn.style.display = "inline-flex";
        viewPlanBtn.onclick = () => switchView("view-plan");
      }
    }
  }

  return newPlan;
}

// Export functions for headless automated testing in Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DIFFICULTY_HOURS,
    getDifficultyHours,
    parseLocalDate,
    formatLocalDate,
    addDaysToDate,
    getDaysBetween,
    calculateUrgency,
    buildSchedulableUnits,
    generatePlan,
    handleGenerateStudyPlan,
    handleReplanSchedule,
    renderStudyPlan,
    renderPlanDaySessions,
    renderTodayView,
    renderSubjectProgressBars,
    renderQuickMetrics,
    toggleSessionCompletion,
    getCompletedHoursForUnit,
    isUnitCompleted,
    updateUnitsCompletionStatus,
    getThemeBadgeClass,
    getThemeTagClass,
    getThemeDotClass,
    getThemeFillClass,
    loadData,
    saveData,
    getDefaultDemoSubjects,
    appData
  };
}

