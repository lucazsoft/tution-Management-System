import campusPhoto from '../../assets/institution/campus-hero.webp';
import emblem from '../../assets/institution/sanskardip-emblem.webp';
import './institution-showcase.css';

/**
 * Public-facing institution details, mirrored from sanskardipshikshalaya.com.np.
 * Update here when the school refreshes its figures or photography.
 */
const INSTITUTION = {
  name: 'Sanskardip Shikshalaya',
  nativeName: 'संस्कारदीप शिक्षालय',
  location: 'Damak, Jhapa',
  website: 'https://sanskardipshikshalaya.com.np',
  stats: [
    { value: '15+', label: 'Teachers', icon: 'school' },
    { value: '250+', label: 'Students', icon: 'groups' },
    { value: '95%', label: 'Success rate', icon: 'workspace_premium' },
  ],
} as const;

export function InstitutionShowcase() {
  return (
    <section className="inst-showcase" aria-labelledby="inst-title">
      <div className="inst-content">
        <header className="inst-brand">
          <span className="inst-emblem">
            <img src={emblem} alt="" width={42} height={42} />
          </span>
          <div className="inst-brand-text">
            <div className="inst-brand-name">{INSTITUTION.name}</div>
            <div className="inst-brand-meta">
              <span lang="ne">{INSTITUTION.nativeName}</span>
              <span className="inst-dot" aria-hidden="true" />
              <span>{INSTITUTION.location}</span>
            </div>
          </div>
          <a
            href={INSTITUTION.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inst-site-link"
            aria-label="Visit the Sanskardip Shikshalaya website"
          >
            Website
            <span className="material-symbols-outlined" aria-hidden="true">north_east</span>
          </a>
        </header>

        <h1 className="inst-title" id="inst-title">
          Lighting Minds.
          <span className="inst-title-accent">Shaping Futures.</span>
        </h1>
        <p className="inst-lede">
          Education that goes beyond textbooks, building character, confidence and clarity for life.
        </p>

        <dl className="inst-stats">
          {INSTITUTION.stats.map((stat) => (
            <div key={stat.label} className="inst-stat">
              <span className="material-symbols-outlined inst-stat-icon" aria-hidden="true">
                {stat.icon}
              </span>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>

        <figure className="inst-photo">
          <img
            src={campusPhoto}
            alt="Sanskardip Shikshalaya students standing together outside the campus"
            decoding="async"
            fetchPriority="high"
          />
          <figcaption className="inst-photo-caption">
            <span className="material-symbols-outlined" aria-hidden="true">location_on</span>
            Our students · {INSTITUTION.location}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
