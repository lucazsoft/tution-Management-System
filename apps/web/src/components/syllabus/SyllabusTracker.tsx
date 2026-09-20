import { useState, useMemo, useRef } from 'react';
import './syllabusTracker.css';

export type SyllabusChapterStatus = 'COMPLETED' | 'IN_PROGRESS' | 'LEFT' | 'NOT_STARTED';

export interface SyllabusTopicLog {
  id?: string;
  status: string;
  notes?: string | null;
  logDate: string;
  updatedAt?: string;
}

export interface SyllabusTopic {
  id: string;
  title: string;
  position: number;
  status: string;
  logs?: SyllabusTopicLog[];
}

export interface SyllabusChapter {
  id: string;
  title: string;
  position: number;
  status: string;
  topics?: SyllabusTopic[];
}

export interface SyllabusDailyLog {
  id: string;
  chapterId: string;
  status: string;
  notes?: string | null;
  logDate: string;
}

export interface SyllabusData {
  id: string;
  subject: string;
  className?: string;
  teacherName?: string;
  chapters: SyllabusChapter[];
  dailyLogs?: SyllabusDailyLog[];
}

export interface SyllabusTrackerProps {
  syllabus?: SyllabusData;
  syllabi?: SyllabusData[];
  initialSubjectId?: string;
  role?: 'teacher' | 'student' | 'admin' | 'parent';
  onEditPlan?: () => void;
  onLogChapter?: (chapterId: string) => void;
  headerActions?: React.ReactNode;
  className?: string;
}

interface SubjectSyllabusViewProps {
  syllabus: SyllabusData;
  role?: 'teacher' | 'student' | 'admin' | 'parent';
  onEditPlan?: () => void;
  onLogChapter?: (chapterId: string) => void;
  headerActions?: React.ReactNode;
  className?: string;
}

function icon(name: string) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
}

function SubjectSyllabusView({
  syllabus,
  role = 'student',
  onEditPlan,
  onLogChapter,
  headerActions,
  className = '',
}: SubjectSyllabusViewProps) {
  // Load initial view mode from localStorage or default to 'grid'
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      const saved = localStorage.getItem('tms_syllabus_view_mode');
      return saved === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'IN_PROGRESS' | 'PENDING'>('ALL');
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});

  const timelineTrackRef = useRef<HTMLDivElement>(null);

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    try {
      localStorage.setItem('tms_syllabus_view_mode', mode);
    } catch {
      // Ignore storage errors
    }
  };

  const toggleChapterExpand = (id: string) => {
    setExpandedChapters((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    syllabus.chapters.forEach((c) => {
      next[c.id] = true;
    });
    setExpandedChapters(next);
  };

  const collapseAll = () => {
    setExpandedChapters({});
  };

  // Metrics calculation
  const chapters = useMemo(() => {
    return [...(syllabus.chapters || [])].sort((a, b) => a.position - b.position);
  }, [syllabus.chapters]);

  const totalChapters = chapters.length;
  const completedChapters = chapters.filter((c) => c.status === 'COMPLETED').length;
  const inProgressChapters = chapters.filter((c) => c.status === 'IN_PROGRESS').length;
  const pendingChapters = totalChapters - completedChapters - inProgressChapters;
  const progressPercentage = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

  // Total topics count across chapters
  const totalTopics = chapters.reduce((acc, c) => acc + (c.topics?.length || 0), 0);
  const completedTopics = chapters.reduce(
    (acc, c) => acc + (c.topics?.filter((t) => t.status === 'COMPLETED').length || 0),
    0
  );

  // Latest daily log lookup map
  const latestLogsByChapter = useMemo(() => {
    const map = new Map<string, SyllabusDailyLog>();
    (syllabus.dailyLogs || []).forEach((log) => {
      if (!map.has(log.chapterId)) {
        map.set(log.chapterId, log);
      }
    });
    return map;
  }, [syllabus.dailyLogs]);

  // Filtered chapters
  const filteredChapters = useMemo(() => {
    return chapters.filter((chapter) => {
      // Status filter
      if (statusFilter === 'COMPLETED' && chapter.status !== 'COMPLETED') return false;
      if (statusFilter === 'IN_PROGRESS' && chapter.status !== 'IN_PROGRESS') return false;
      if (statusFilter === 'PENDING' && (chapter.status === 'COMPLETED' || chapter.status === 'IN_PROGRESS')) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = chapter.title.toLowerCase().includes(query);
        const matchesTopic = chapter.topics?.some((t) => t.title.toLowerCase().includes(query));
        const latestLog = latestLogsByChapter.get(chapter.id);
        const matchesLog = latestLog?.notes?.toLowerCase().includes(query);
        return matchesTitle || matchesTopic || matchesLog;
      }
      return true;
    });
  }, [chapters, statusFilter, searchQuery, latestLogsByChapter]);

  // Scroll timeline
  const scrollTimeline = (direction: 'left' | 'right') => {
    if (timelineTrackRef.current) {
      const offset = direction === 'left' ? -260 : 260;
      timelineTrackRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  // Scroll into view when clicking a chapter node on the timeline
  const handleTimelineNodeClick = (chapterId: string) => {
    setActiveChapterId(chapterId);
    setExpandedChapters((prev) => ({ ...prev, [chapterId]: true }));
    const element = document.getElementById(`syllabus-chapter-${chapterId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const getStatusTone = (status: string) => {
    if (status === 'COMPLETED') return 'success';
    if (status === 'IN_PROGRESS') return 'warning';
    return 'neutral';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'COMPLETED') return 'Completed';
    if (status === 'IN_PROGRESS') return 'In Progress';
    return 'Untouched';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'COMPLETED') return 'check_circle';
    if (status === 'IN_PROGRESS') return 'pending';
    return 'radio_button_unchecked';
  };

  return (
    <div className={`syllabus-tracker ${className}`}>
      {/* Header Overview Card */}
      <section className="syllabus-header-card">
        <div className="syllabus-header-info">
          <div className="syllabus-eyebrow-row">
            <span className="syllabus-eyebrow">
              {icon('menu_book')}
              <span>{syllabus.className || 'Academic Syllabus'}</span>
            </span>
            {syllabus.teacherName && (
              <span className="syllabus-teacher-badge">
                {icon('person')}
                <span>{syllabus.teacherName}</span>
              </span>
            )}
          </div>
          <h2 className="syllabus-title">{syllabus.subject}</h2>
          <p className="syllabus-subtitle">
            {completedChapters} of {totalChapters} chapters completed
            {totalTopics > 0 ? ` · ${completedTopics} of ${totalTopics} topics finished` : ''}
          </p>
        </div>

        {/* Big Circular/Bar Progress Display */}
        <div className="syllabus-overall-progress">
          <div className="syllabus-progress-circle-wrap">
            <div
              className="syllabus-progress-circle"
              style={{ '--progress-val': `${progressPercentage}%` } as React.CSSProperties}
            >
              <div className="syllabus-progress-circle-inner">
                <strong>{progressPercentage}%</strong>
                <small>Completed</small>
              </div>
            </div>
          </div>
          <div className="syllabus-header-actions">
            {onEditPlan && (
              <button
                type="button"
                className="syllabus-btn syllabus-btn--primary"
                onClick={onEditPlan}
                aria-label="Edit syllabus plan"
              >
                {icon('edit')}
                <span>Edit plan</span>
              </button>
            )}
            {headerActions}
          </div>
        </div>
      </section>

      {/* 100% Completion Celebration Banner */}
      {progressPercentage === 100 && totalChapters > 0 && (
        <aside className="syllabus-celebration-banner" role="status">
          <div className="syllabus-celebration-icon">{icon('verified')}</div>
          <div className="syllabus-celebration-text">
            <strong>Syllabus 100% Complete!</strong>
            <p>All chapters and topics for {syllabus.subject} have been fully covered.</p>
          </div>
        </aside>
      )}

      {/* Horizontal Bar & Timeline Structure */}
      <section className="syllabus-timeline-section" aria-label="Chapter syllabus timeline">
        <div className="syllabus-timeline-head">
          <div className="syllabus-timeline-title">
            {icon('linear_scale')}
            <h3>Chapter Progress Timeline</h3>
            <span className="syllabus-timeline-chip">
              {completedChapters}/{totalChapters} Chapters
            </span>
          </div>

          <div className="syllabus-timeline-nav-buttons">
            <button
              type="button"
              className="syllabus-icon-btn"
              onClick={() => scrollTimeline('left')}
              title="Scroll left"
              aria-label="Scroll timeline left"
            >
              {icon('chevron_left')}
            </button>
            <button
              type="button"
              className="syllabus-icon-btn"
              onClick={() => scrollTimeline('right')}
              title="Scroll right"
              aria-label="Scroll timeline right"
            >
              {icon('chevron_right')}
            </button>
          </div>
        </div>

        {/* Master Horizontal Progress Bar Track */}
        <div className="syllabus-master-progress-rail" aria-label={`${progressPercentage}% completed`}>
          <div
            className="syllabus-master-progress-fill"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>

        {/* Interactive Horizontal Chapter Scrubber Rail */}
        <div className="syllabus-timeline-scroll-container" ref={timelineTrackRef}>
          <div className="syllabus-timeline-track">
            {chapters.map((chapter, index) => {
              const tone = getStatusTone(chapter.status);
              const isFirst = index === 0;
              const isLast = index === chapters.length - 1;
              const isActive = activeChapterId === chapter.id;
              const chapterTopics = chapter.topics || [];
              const doneTopics = chapterTopics.filter((t) => t.status === 'COMPLETED').length;

              return (
                <div
                  key={chapter.id}
                  className={`syllabus-timeline-node-wrap ${isFirst ? 'is-first' : ''} ${isLast ? 'is-last' : ''} is-${tone} ${isActive ? 'is-active' : ''}`}
                >
                  {/* Connecting Rail Line */}
                  {!isFirst && (
                    <div
                      className={`syllabus-timeline-connector ${
                        chapter.status === 'COMPLETED' ? 'is-completed' : chapter.status === 'IN_PROGRESS' ? 'is-in-progress' : ''
                      }`}
                    />
                  )}

                  {/* Milestone Node Button */}
                  <button
                    type="button"
                    className="syllabus-timeline-node"
                    onClick={() => handleTimelineNodeClick(chapter.id)}
                    aria-label={`Chapter ${chapter.position}: ${chapter.title} (${getStatusLabel(chapter.status)})`}
                    title={`Chapter ${chapter.position}: ${chapter.title}`}
                  >
                    <span className="syllabus-node-disc">
                      {chapter.status === 'COMPLETED' ? (
                        icon('check')
                      ) : chapter.status === 'IN_PROGRESS' ? (
                        <span className="syllabus-node-pulse" />
                      ) : (
                        chapter.position
                      )}
                    </span>
                    <span className="syllabus-node-label">
                      <span className="syllabus-node-num">Ch {chapter.position}</span>
                      <strong className="syllabus-node-name">{chapter.title}</strong>
                      <small className="syllabus-node-status">
                        {chapterTopics.length > 0 ? `${doneTopics}/${chapterTopics.length} topics` : getStatusLabel(chapter.status)}
                      </small>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Metrics KPI Cards */}
      <section className="syllabus-metrics-grid" aria-label="Syllabus statistics">
        <div className="syllabus-metric-card">
          <div className="syllabus-metric-icon syllabus-metric-icon--primary">{icon('menu_book')}</div>
          <div className="syllabus-metric-content">
            <span className="syllabus-metric-label">Total Chapters</span>
            <strong className="syllabus-metric-value">{totalChapters}</strong>
            <small className="syllabus-metric-sub">{totalTopics} topics overall</small>
          </div>
        </div>

        <div className="syllabus-metric-card">
          <div className="syllabus-metric-icon syllabus-metric-icon--success">{icon('check_circle')}</div>
          <div className="syllabus-metric-content">
            <span className="syllabus-metric-label">Completed</span>
            <strong className="syllabus-metric-value">{completedChapters}</strong>
            <small className="syllabus-metric-sub">{completedTopics} topics done</small>
          </div>
        </div>

        <div className="syllabus-metric-card">
          <div className="syllabus-metric-icon syllabus-metric-icon--warning">{icon('pending')}</div>
          <div className="syllabus-metric-content">
            <span className="syllabus-metric-label">In Progress</span>
            <strong className="syllabus-metric-value">{inProgressChapters}</strong>
            <small className="syllabus-metric-sub">Actively being taught</small>
          </div>
        </div>

        <div className="syllabus-metric-card">
          <div className="syllabus-metric-icon syllabus-metric-icon--neutral">{icon('schedule')}</div>
          <div className="syllabus-metric-content">
            <span className="syllabus-metric-label">Remaining</span>
            <strong className="syllabus-metric-value">{pendingChapters}</strong>
            <small className="syllabus-metric-sub">Untouched chapters</small>
          </div>
        </div>
      </section>

      {/* Controls: Search, Status Filter & Grid/List View Switcher */}
      <section className="syllabus-controls-bar">
        <div className="syllabus-search-wrap">
          {icon('search')}
          <input
            type="search"
            placeholder="Search chapters, topics, or lesson notes…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="syllabus-search-input"
            aria-label="Search chapters and topics"
          />
          {searchQuery && (
            <button
              type="button"
              className="syllabus-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              {icon('close')}
            </button>
          )}
        </div>

        <div className="syllabus-filter-pills" role="radiogroup" aria-label="Filter chapters by status">
          <button
            type="button"
            className={`syllabus-filter-pill ${statusFilter === 'ALL' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
            aria-checked={statusFilter === 'ALL'}
          >
            All <span>{totalChapters}</span>
          </button>
          <button
            type="button"
            className={`syllabus-filter-pill syllabus-filter-pill--success ${statusFilter === 'COMPLETED' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter('COMPLETED')}
            aria-checked={statusFilter === 'COMPLETED'}
          >
            Completed <span>{completedChapters}</span>
          </button>
          <button
            type="button"
            className={`syllabus-filter-pill syllabus-filter-pill--warning ${statusFilter === 'IN_PROGRESS' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter('IN_PROGRESS')}
            aria-checked={statusFilter === 'IN_PROGRESS'}
          >
            In Progress <span>{inProgressChapters}</span>
          </button>
          <button
            type="button"
            className={`syllabus-filter-pill ${statusFilter === 'PENDING' ? 'is-active' : ''}`}
            onClick={() => setStatusFilter('PENDING')}
            aria-checked={statusFilter === 'PENDING'}
          >
            Pending <span>{pendingChapters}</span>
          </button>
        </div>

        <div className="syllabus-view-actions">
          {/* Grid vs List View Switcher */}
          <div className="syllabus-view-toggle" role="group" aria-label="View layout switch">
            <button
              type="button"
              className={`syllabus-view-btn ${viewMode === 'grid' ? 'is-active' : ''}`}
              onClick={() => handleViewModeChange('grid')}
              aria-pressed={viewMode === 'grid'}
              title="Grid View"
            >
              {icon('grid_view')}
              <span>Grid</span>
            </button>
            <button
              type="button"
              className={`syllabus-view-btn ${viewMode === 'list' ? 'is-active' : ''}`}
              onClick={() => handleViewModeChange('list')}
              aria-pressed={viewMode === 'list'}
              title="List View"
            >
              {icon('format_list_bulleted')}
              <span>List</span>
            </button>
          </div>

          {/* Expand/Collapse All Buttons */}
          <div className="syllabus-expand-toggle">
            <button
              type="button"
              className="syllabus-text-action"
              onClick={expandAll}
              title="Expand all topic checklists"
            >
              {icon('unfold_more')}
              <span>Expand all</span>
            </button>
            <button
              type="button"
              className="syllabus-text-action"
              onClick={collapseAll}
              title="Collapse all topic checklists"
            >
              {icon('unfold_less')}
              <span>Collapse</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Chapters Content: Grid View or List View */}
      {filteredChapters.length === 0 ? (
        <div className="syllabus-empty-state" role="status">
          <div className="syllabus-empty-icon">{icon('search_off')}</div>
          <h3>No chapters found</h3>
          <p>
            {searchQuery
              ? `No chapters or topics match “${searchQuery}”. Try clearing your search or status filter.`
              : 'No chapters match the selected filter.'}
          </p>
          {(searchQuery || statusFilter !== 'ALL') && (
            <button
              type="button"
              className="syllabus-btn syllabus-btn--secondary"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
              }}
            >
              Reset filters
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="syllabus-grid-view">
          {filteredChapters.map((chapter) => {
            const tone = getStatusTone(chapter.status);
            const latestLog = latestLogsByChapter.get(chapter.id);
            const chapterTopics = chapter.topics || [];
            const doneTopics = chapterTopics.filter((t) => t.status === 'COMPLETED').length;
            const topicProgress = chapterTopics.length > 0 ? Math.round((doneTopics / chapterTopics.length) * 100) : chapter.status === 'COMPLETED' ? 100 : 0;
            const isExpanded = expandedChapters[chapter.id] ?? false;
            const isTargeted = activeChapterId === chapter.id;

            return (
              <article
                key={chapter.id}
                id={`syllabus-chapter-${chapter.id}`}
                className={`syllabus-grid-card is-${tone} ${isTargeted ? 'is-targeted' : ''}`}
              >
                <div className="syllabus-card-top">
                  <div className="syllabus-chapter-tag">
                    <span className="syllabus-chapter-number">Chapter {chapter.position}</span>
                    <span className={`syllabus-status-pill is-${tone}`}>
                      {icon(getStatusIcon(chapter.status))}
                      <span>{getStatusLabel(chapter.status)}</span>
                    </span>
                  </div>

                  {role === 'teacher' && onLogChapter && (
                    <button
                      type="button"
                      className="syllabus-card-action-btn"
                      onClick={() => onLogChapter(chapter.id)}
                      title="Log class lesson update"
                    >
                      {icon('edit_note')}
                      <span>Log update</span>
                    </button>
                  )}
                </div>

                <h3 className="syllabus-card-title">{chapter.title}</h3>

                {/* Micro topic progress bar */}
                {chapterTopics.length > 0 && (
                  <div className="syllabus-card-progress">
                    <div className="syllabus-card-progress-bar">
                      <div
                        className={`syllabus-card-progress-fill is-${tone}`}
                        style={{ width: `${topicProgress}%` }}
                      />
                    </div>
                    <div className="syllabus-card-progress-labels">
                      <small>{doneTopics} of {chapterTopics.length} topics done</small>
                      <strong>{topicProgress}%</strong>
                    </div>
                  </div>
                )}

                {/* Latest daily lesson update preview */}
                {latestLog && (
                  <div className="syllabus-card-log-preview">
                    <div className="syllabus-log-badge">
                      {icon('event_note')}
                      <span>{latestLog.logDate}</span>
                    </div>
                    {latestLog.notes ? (
                      <p className="syllabus-log-note">“{latestLog.notes}”</p>
                    ) : (
                      <p className="syllabus-log-note is-empty">Class session logged.</p>
                    )}
                  </div>
                )}

                {/* Topics Accordion Section */}
                {chapterTopics.length > 0 && (
                  <div className="syllabus-card-topics-wrapper">
                    <button
                      type="button"
                      className="syllabus-topics-expand-btn"
                      onClick={() => toggleChapterExpand(chapter.id)}
                      aria-expanded={isExpanded}
                    >
                      <span>
                        {icon('format_list_bulleted')}
                        <span>Topics breakdown ({chapterTopics.length})</span>
                      </span>
                      {icon(isExpanded ? 'expand_less' : 'expand_more')}
                    </button>

                    {isExpanded && (
                      <ul className="syllabus-topics-list">
                        {chapterTopics.map((topic) => {
                          const topicTone = getStatusTone(topic.status);
                          const latestTopicLog = topic.logs?.[0];
                          return (
                            <li key={topic.id} className={`syllabus-topic-item is-${topicTone}`}>
                              <span className="syllabus-topic-bullet" aria-hidden="true" />
                              <div className="syllabus-topic-content">
                                <strong className="syllabus-topic-title">{topic.title}</strong>
                                {latestTopicLog?.notes && (
                                  <small className="syllabus-topic-note">
                                    {latestTopicLog.notes} · {latestTopicLog.logDate}
                                  </small>
                                )}
                              </div>
                              <span className={`syllabus-topic-pill is-${topicTone}`}>
                                {icon(getStatusIcon(topic.status))}
                                <span>{getStatusLabel(topic.status)}</span>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="syllabus-list-view">
          <div className="syllabus-list-container">
            {filteredChapters.map((chapter) => {
              const tone = getStatusTone(chapter.status);
              const latestLog = latestLogsByChapter.get(chapter.id);
              const chapterTopics = chapter.topics || [];
              const doneTopics = chapterTopics.filter((t) => t.status === 'COMPLETED').length;
              const topicProgress = chapterTopics.length > 0 ? Math.round((doneTopics / chapterTopics.length) * 100) : chapter.status === 'COMPLETED' ? 100 : 0;
              const isExpanded = expandedChapters[chapter.id] ?? false;
              const isTargeted = activeChapterId === chapter.id;

              return (
                <article
                  key={chapter.id}
                  id={`syllabus-chapter-${chapter.id}`}
                  className={`syllabus-list-row is-${tone} ${isTargeted ? 'is-targeted' : ''}`}
                >
                  <div className="syllabus-list-left">
                    <span className="syllabus-list-marker">{chapter.position}</span>
                    <div className="syllabus-list-info">
                      <div className="syllabus-list-title-row">
                        <span className="syllabus-list-chapter-badge">Ch {chapter.position}</span>
                        <h3 className="syllabus-list-title">{chapter.title}</h3>
                        <span className={`syllabus-status-pill is-${tone}`}>
                          {icon(getStatusIcon(chapter.status))}
                          <span>{getStatusLabel(chapter.status)}</span>
                        </span>
                      </div>

                      {latestLog && (
                        <div className="syllabus-list-log-line">
                          {icon('history_edu')}
                          <span>
                            Updated {latestLog.logDate}
                            {latestLog.notes ? `: “${latestLog.notes}”` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="syllabus-list-right">
                    {chapterTopics.length > 0 && (
                      <div className="syllabus-list-topic-progress">
                        <div className="syllabus-list-bar">
                          <span
                            className={`syllabus-card-progress-fill is-${tone}`}
                            style={{ width: `${topicProgress}%` }}
                          />
                        </div>
                        <small>{doneTopics}/{chapterTopics.length} topics ({topicProgress}%)</small>
                      </div>
                    )}

                    <div className="syllabus-list-row-actions">
                      {role === 'teacher' && onLogChapter && (
                        <button
                          type="button"
                          className="syllabus-btn syllabus-btn--sm syllabus-btn--secondary"
                          onClick={() => onLogChapter(chapter.id)}
                          title="Log class lesson update"
                        >
                          {icon('edit_note')}
                          <span>Log update</span>
                        </button>
                      )}

                      {chapterTopics.length > 0 && (
                        <button
                          type="button"
                          className="syllabus-icon-btn syllabus-icon-btn--pill"
                          onClick={() => toggleChapterExpand(chapter.id)}
                          aria-expanded={isExpanded}
                          title={isExpanded ? 'Collapse topics' : 'Expand topics'}
                        >
                          <span>{chapterTopics.length} topics</span>
                          {icon(isExpanded ? 'expand_less' : 'expand_more')}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Topics List in List View */}
                  {isExpanded && chapterTopics.length > 0 && (
                    <div className="syllabus-list-expanded-topics">
                      <ul className="syllabus-topics-list">
                        {chapterTopics.map((topic) => {
                          const topicTone = getStatusTone(topic.status);
                          const latestTopicLog = topic.logs?.[0];
                          return (
                            <li key={topic.id} className={`syllabus-topic-item is-${topicTone}`}>
                              <span className="syllabus-topic-bullet" aria-hidden="true" />
                              <div className="syllabus-topic-content">
                                <strong className="syllabus-topic-title">{topic.title}</strong>
                                {latestTopicLog?.notes && (
                                  <small className="syllabus-topic-note">
                                    {latestTopicLog.notes} · {latestTopicLog.logDate}
                                  </small>
                                )}
                              </div>
                              <span className={`syllabus-topic-pill is-${topicTone}`}>
                                {icon(getStatusIcon(topic.status))}
                                <span>{getStatusLabel(topic.status)}</span>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


/* ===================================================
   Multi-Subject Navigator & Single Subject Wrapper
   =================================================== */

export function SyllabusTracker({
  syllabus,
  syllabi,
  initialSubjectId,
  role = 'student',
  onEditPlan,
  onLogChapter,
  headerActions,
  className = '',
}: SyllabusTrackerProps) {
  // Normalize syllabi list
  const allSyllabi = useMemo(() => {
    if (syllabi && syllabi.length > 0) return syllabi;
    if (syllabus) return [syllabus];
    return [];
  }, [syllabi, syllabus]);

  // Subject search query & view mode (grid vs list)
  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectViewMode, setSubjectViewMode] = useState<'grid' | 'list'>(() => {
    try {
      const saved = localStorage.getItem('tms_syllabus_subject_view_mode');
      return saved === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });

  // Active selected subject
  // By default, no subject is auto-opened. The user clicks a subject card/row
  // or selects from the dropdown to open/expand that subject's syllabus tracking.
  const [activeSubjectId, setActiveSubjectId] = useState<string>(() => {
    if (initialSubjectId && allSyllabi.some((s) => s.id === initialSubjectId)) {
      return initialSubjectId;
    }
    return '';
  });

  const handleSubjectViewModeChange = (mode: 'grid' | 'list') => {
    setSubjectViewMode(mode);
    try {
      localStorage.setItem('tms_syllabus_subject_view_mode', mode);
    } catch {
      // Ignore storage errors
    }
  };

  // Filtered syllabi for overview
  const filteredSyllabi = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    if (!q) return allSyllabi;
    return allSyllabi.filter((s) => {
      const matchSub = s.subject?.toLowerCase().includes(q);
      const matchClass = s.className?.toLowerCase().includes(q);
      const matchTeacher = s.teacherName?.toLowerCase().includes(q);
      return matchSub || matchClass || matchTeacher;
    });
  }, [allSyllabi, subjectSearch]);

  const activeSyllabus = allSyllabi.find((s) => s.id === activeSubjectId);

  // Helper calculation for a subject's progress
  const getSubjectStats = (s: SyllabusData) => {
    const chapters = s.chapters || [];
    const total = chapters.length;
    const completed = chapters.filter((c) => c.status === 'COMPLETED').length;
    const inProgress = chapters.filter((c) => c.status === 'IN_PROGRESS').length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, percent };
  };

  if (!allSyllabi.length) {
    return (
      <div className={`syllabus-tracker ${className}`}>
        <section className="syllabus-empty-state" role="status">
          <div className="syllabus-empty-icon">{icon('menu_book')}</div>
          <h3 className="syllabus-empty-title">No syllabus shared</h3>
          <p className="syllabus-empty-text">
            Chapter and topic progress will appear here once published.
          </p>
        </section>
      </div>
    );
  }

  // Render direct subject view if a subject is active
  if (activeSyllabus) {
    return (
      <div className={`syllabus-tracker ${className}`}>
        {allSyllabi.length > 1 && (
          <div className="syl-subject-nav-bar" role="navigation" aria-label="Subject navigation">
            <div className="syl-subject-nav-left">
              <button
                type="button"
                className="syl-back-btn"
                onClick={() => setActiveSubjectId('')}
                aria-label="Back to all subjects"
              >
                {icon('arrow_back')}
                <span>All Subjects</span>
              </button>

              <div className="syl-subject-dropdown-wrap">
                <span className="syl-subject-dropdown-label">
                  {icon('school')}
                  <span>Subject:</span>
                </span>
                <select
                  className="syl-subject-select"
                  value={activeSubjectId}
                  onChange={(e) => setActiveSubjectId(e.target.value)}
                  aria-label="Directly switch subject"
                >
                  {allSyllabi.map((s) => {
                    const { percent } = getSubjectStats(s);
                    return (
                      <option key={s.id} value={s.id}>
                        {s.subject} ({percent}% · {s.className || 'Class'})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div className="syl-subject-nav-right">
              <span className="syllabus-timeline-chip">
                {allSyllabi.findIndex((s) => s.id === activeSubjectId) + 1} of {allSyllabi.length} subjects
              </span>
            </div>
          </div>
        )}

        <SubjectSyllabusView
          syllabus={activeSyllabus}
          role={role}
          onEditPlan={onEditPlan}
          onLogChapter={onLogChapter}
          headerActions={headerActions}
        />
      </div>
    );
  }

  // Otherwise, render the Subject Directory Overview (Grid or List view)
  return (
    <div className={`syllabus-tracker ${className}`}>
      {/* Header with Search & Direct Jump Dropdown */}
      <section className="syl-browser-header">
        <div className="syl-browser-info">
          <span className="syllabus-eyebrow">
            {icon('library_books')}
            <span>SUBJECT SYLLABUS DIRECTORY</span>
          </span>
          <h2>Course Syllabus Progress</h2>
          <p>
            Choose a subject to view its horizontal progress bar, chapter timeline, and completion logs.
          </p>
        </div>

        <div className="syl-subject-dropdown-wrap" style={{ background: '#ffffff', padding: '6px 14px', border: '1.5px solid var(--syl-primary, #1560bd)' }}>
          <span className="syl-subject-dropdown-label" style={{ color: 'var(--syl-primary, #1560bd)' }}>
            {icon('arrow_drop_down_circle')}
            <span>Select Subject to track:</span>
          </span>
          <select
            className="syl-subject-select"
            value={activeSubjectId}
            onChange={(e) => {
              if (e.target.value) setActiveSubjectId(e.target.value);
            }}
            aria-label="Select subject to expand tracking"
          >
            <option value="">-- Click or choose a subject to expand --</option>
            {allSyllabi.map((s) => {
              const { percent } = getSubjectStats(s);
              return (
                <option key={s.id} value={s.id}>
                  {s.subject} ({percent}% completed)
                </option>
              );
            })}
          </select>
        </div>
      </section>

      {/* Toolbar: Search + Grid / List Toggle */}
      <div className="syl-browser-toolbar">
        <div className="syl-browser-search">
          {icon('search')}
          <input
            type="search"
            placeholder="Filter subjects by name, class, teacher…"
            value={subjectSearch}
            onChange={(e) => setSubjectSearch(e.target.value)}
            aria-label="Filter subjects"
          />
        </div>

        <div className="syl-view-toggle-group" role="group" aria-label="Subject view mode">
          <button
            type="button"
            className={`syl-view-toggle-btn ${subjectViewMode === 'grid' ? 'is-active' : ''}`}
            onClick={() => handleSubjectViewModeChange('grid')}
            aria-pressed={subjectViewMode === 'grid'}
          >
            {icon('grid_view')}
            <span>Grid view</span>
          </button>
          <button
            type="button"
            className={`syl-view-toggle-btn ${subjectViewMode === 'list' ? 'is-active' : ''}`}
            onClick={() => handleSubjectViewModeChange('list')}
            aria-pressed={subjectViewMode === 'list'}
          >
            {icon('view_list')}
            <span>List view</span>
          </button>
        </div>
      </div>

      {/* Subject Cards Grid View */}
      {subjectViewMode === 'grid' ? (
        filteredSyllabi.length > 0 ? (
          <div className="syl-subjects-grid">
            {filteredSyllabi.map((s) => {
              const { total, completed, inProgress, percent } = getSubjectStats(s);
              const isHigh = percent >= 75;
              const isMid = percent >= 30 && percent < 75;

              return (
                <div
                  key={s.id}
                  className="syl-subject-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveSubjectId(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveSubjectId(s.id);
                    }
                  }}
                  aria-label={`Open ${s.subject} syllabus, ${percent}% completed`}
                >
                  <div>
                    <div className="syl-subject-card-top">
                      <div>
                        <h3 className="syl-subject-title">{s.subject}</h3>
                        {s.className && (
                          <span className="syl-subject-class-chip">{s.className}</span>
                        )}
                      </div>
                      <span
                        className={`syl-subject-rate-badge ${isHigh ? 'is-high' : isMid ? 'is-mid' : ''}`}
                      >
                        {percent}%
                      </span>
                    </div>

                    <div className="syl-subject-card-progress" style={{ marginTop: 14 }}>
                      <div className="syl-subject-progress-bar">
                        <div
                          className={`syl-subject-progress-fill ${isHigh ? 'is-high' : ''}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="syl-subject-progress-labels">
                        <span>{completed} of {total} chapters</span>
                        <span>{inProgress > 0 ? `${inProgress} in progress` : 'Up to date'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="syl-subject-card-footer">
                    <span className="syl-subject-teacher">
                      {icon('person')}
                      <span>{s.teacherName || 'Assigned faculty'}</span>
                    </span>
                    <span className="syl-subject-open-cta" style={{ background: 'var(--syl-primary-soft, rgba(21, 96, 189, 0.08))', padding: '4px 10px', borderRadius: '12px' }}>
                      <span>Click to open tracking</span>
                      {icon('arrow_forward')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="syllabus-empty-state">
            <div className="syllabus-empty-icon">{icon('search_off')}</div>
            <h3 className="syllabus-empty-title">No subjects match "{subjectSearch}"</h3>
            <p className="syllabus-empty-text">Try searching by a different name or clear the search.</p>
          </div>
        )
      ) : (
        /* Subject List View */
        filteredSyllabi.length > 0 ? (
          <div className="syl-subjects-list" role="table" aria-label="Subject list">
            {filteredSyllabi.map((s) => {
              const { total, completed, inProgress, percent } = getSubjectStats(s);
              const isHigh = percent >= 75;

              return (
                <div
                  key={s.id}
                  className="syl-subject-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveSubjectId(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveSubjectId(s.id);
                    }
                  }}
                  aria-label={`Open ${s.subject} syllabus`}
                >
                  <div className="syl-subject-row-info">
                    <span className="syl-subject-row-title">{s.subject}</span>
                    {s.className && <span className="syl-subject-class-chip" style={{ width: 'fit-content' }}>{s.className}</span>}
                  </div>

                  <div className="syl-subject-row-teacher">
                    {icon('person')}
                    <span>{s.teacherName || 'Assigned faculty'}</span>
                  </div>

                  <div className="syl-subject-row-progress">
                    <div className="syl-subject-progress-bar">
                      <div
                        className={`syl-subject-progress-fill ${isHigh ? 'is-high' : ''}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <div className="syl-subject-progress-labels">
                      <strong>{percent}% completed</strong>
                      <span>{inProgress > 0 ? `${inProgress} active` : ''}</span>
                    </div>
                  </div>

                  <div className="syl-subject-row-chapters">
                    {completed}/{total} ch
                  </div>

                  <div className="syl-subject-row-action">
                    <span className="syl-btn-open" style={{ padding: '6px 14px' }}>
                      <span>Click to view</span>
                      {icon('arrow_forward')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="syllabus-empty-state">
            <div className="syllabus-empty-icon">{icon('search_off')}</div>
            <h3 className="syllabus-empty-title">No subjects match "{subjectSearch}"</h3>
            <p className="syllabus-empty-text">Try searching by a different name or clear the search.</p>
          </div>
        )
      )}
    </div>
  );
}
