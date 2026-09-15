import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './accountMenu.css';

interface AccountMenuProps {
  name: string;
  role: string;
  avatar?: string;
  accountPath?: string;
  securityPath?: string;
  onLogout: () => void;
}

export function AccountMenu({ name, role, avatar, accountPath, securityPath, onLogout }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const location = useLocation();
  const initials = name.split(' ').filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  useEffect(() => { setOpen(false); }, [location.key]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="account-menu" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button ref={trigger} type="button" className="account-menu__trigger" aria-label="User account menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span className="account-menu__avatar">{avatar ? <img src={avatar} alt="" /> : initials || 'U'}</span>
      <span className="account-menu__identity"><strong>{name}</strong><small>{role}</small></span>
      <span className="material-symbols-outlined" aria-hidden="true">expand_more</span>
    </button>
    {open && <div id={id} className="account-menu__panel">
      <div className="account-menu__heading"><strong>{name}</strong><small>{role}</small></div>
      <nav aria-label="Personal account">
        {accountPath && <Link to={accountPath} onClick={() => setOpen(false)}><span className="material-symbols-outlined" aria-hidden="true">person</span>My account</Link>}
        {securityPath && <Link to={securityPath} onClick={() => setOpen(false)}><span className="material-symbols-outlined" aria-hidden="true">security</span>Security</Link>}
      </nav>
      <button type="button" className="account-menu__logout" onClick={() => { setOpen(false); onLogout(); }}><span className="material-symbols-outlined" aria-hidden="true">logout</span>Sign out</button>
    </div>}
  </div>;
}
