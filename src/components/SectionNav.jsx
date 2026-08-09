import { memo, useEffect, useState } from "react";

// Anchors to existing card ids in App.jsx — deliberately not reordering any content,
// just adding jump targets to what's already there.
const SECTIONS = [
  { id: "section-overview", label: "Overview" },
  { id: "section-weight", label: "Weight" },
  { id: "section-goal", label: "Goal" },
  { id: "section-checkin", label: "Daily Check-In" },
  { id: "section-lab-results", label: "Lab Results" },
  { id: "section-import", label: "Import Lab Report" },
  { id: "section-lab-insights", label: "Lab Insights" },
  { id: "section-ai-coach", label: "AI Health Coach" },
  { id: "section-ai-chat", label: "AI Chat" },
  { id: "section-visit-summary", label: "Visit Summary" },
];

function SectionNav() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);

  useEffect(() => {
    const elements = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean);
    if (elements.length === 0) return;

    // Treat a section as "current" once it's within the top third of the viewport —
    // whichever tracked section is closest to that band wins.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        );
        setActiveId(topMost.target.id);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Always JS-driven smooth scroll — never let the browser's default instant hash-jump
  // change the URL, so a page refresh still lands back at the top like before.
  const handleClick = (e, id) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Move focus to the section so keyboard/screen-reader users land where they jumped to.
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  };

  return (
    <nav className="section-nav" aria-label="Page sections">
      <ul className="section-nav-list">
        {SECTIONS.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              onClick={(e) => handleClick(e, section.id)}
              aria-current={activeId === section.id ? "true" : undefined}
              className={`section-nav-link ${
                activeId === section.id ? "section-nav-link-active" : ""
              }`}
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default memo(SectionNav);
