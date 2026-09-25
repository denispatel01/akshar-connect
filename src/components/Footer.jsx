import React from 'react';
import { Download, Calendar, Smartphone, PlayCircle, Music2, BookOpen, Image as ImageIcon, ExternalLink, Heart } from 'lucide-react';

const BASE = import.meta.env.BASE_URL;

const SECTIONS = [
  {
    title: 'Downloads & Smruti',
    links: [
      { label: 'Wallpapers & HD Smruti', href: 'https://home.ydscanada.org/downloads.html', icon: ImageIcon },
      { label: 'Calendar 2026', href: 'https://ihariprabodham.org/calendar2026', icon: Calendar },
    ],
  },
  {
    title: 'HariPrabodham Apps',
    links: [
      { label: 'HariPrabodham Vrund — Android', href: 'https://play.google.com/store/apps/details?id=com.suhradvrund&pcampaignid=web_share', icon: Smartphone },
      { label: 'HariPrabodham Vrund — iPhone', href: 'https://apps.apple.com/in/app/hariprabodham-vrund/id6474902923', icon: Smartphone },
      { label: 'Mari Smruti', href: 'https://play.google.com/store/apps/details?id=org.hariprabodham.mari_smruti&pcampaignid=web_share', icon: BookOpen },
      { label: 'Swaminivato', href: 'https://play.google.com/store/apps/details?id=org.hariprabodham.swaminivato&pcampaignid=web_share', icon: BookOpen },
      { label: 'Kirtan', href: 'https://play.google.com/store/apps/details?id=org.hariprabodham.kirtan&pcampaignid=web_share', icon: Music2 },
    ],
  },
  {
    title: 'Watch',
    links: [
      { label: 'iHariPrabodham', href: 'https://www.youtube.com/@iHariPrabodham', icon: PlayCircle },
      { label: 'The Home Beyond', href: 'https://www.youtube.com/@TheHomeBeyond', icon: PlayCircle },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-8 bg-gradient-to-b from-[#022c54] to-[#001a33] text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="rounded-2xl bg-white/95 px-4 py-3 shadow-md w-full">
              <img src={`${BASE}images/logo.webp`} alt="Akshar Connect" className="w-full h-auto object-contain" />
            </div>
            <p className="mt-3 text-sm font-semibold text-white/90">Adajan Satsang Mandal</p>
            <p className="text-xs text-white/60 leading-relaxed mt-1">
              Swaminarayan Hariprabodham Foundation<br />Adajan, Surat
            </p>
            <p className="mt-3 text-xs italic text-[#FFC79A]">Connecting Devotees with Divinity</p>
          </div>

          {/* Link columns */}
          {SECTIONS.map((sec) => (
            <div key={sec.title}>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#FFB27D] mb-3">{sec.title}</h3>
              <ul className="space-y-2.5">
                {sec.links.map((l) => {
                  const Icon = l.icon;
                  return (
                    <li key={l.label}>
                      <a href={l.href} target="_blank" rel="noreferrer"
                        className="group flex items-center gap-2.5 text-sm text-white/80 hover:text-white transition">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface/10 text-[#FFB27D] group-hover:bg-surface/20">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 truncate">{l.label}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-white/30 group-hover:text-white/60" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-9 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10 pt-5">
          <p className="text-xs text-white/50">© {new Date().getFullYear()} Akshar Connect · Adajan Satsang Mandal</p>
          <p className="text-xs text-white/60 flex items-center gap-1.5">
            Made with <Heart className="h-3.5 w-3.5 text-[#FF862A] fill-[#FF862A]" /> for satsang · <span className="text-[#FFC79A] font-semibold">Jai Swaminarayan</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
