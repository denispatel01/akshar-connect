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
      <div className="w-full px-5 sm:px-8 lg:px-12 pt-12 pb-[calc(7rem_+_env(safe-area-inset-bottom))] md:pb-12">
        {/* Brand on the left, the three link groups spread across to the right — so
            the full width is used and the last group sits at the right edge. */}
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
          {/* Brand */}
          <div className="max-w-sm">
            <div className="inline-flex rounded-2xl bg-white/95 p-3 shadow-lg">
              <img src={`${BASE}images/logo.webp`} alt="Akshar Connect" className="h-16 w-auto object-contain sm:h-20" />
            </div>
            <p className="mt-4 text-base font-bold text-white">Adajan Satsang Mandal</p>
            <p className="mt-1 text-sm leading-relaxed text-white/60">
              Swaminarayan Hariprabodham Foundation<br />Adajan, Surat
            </p>
            <p className="mt-3 text-sm italic text-[#FFC79A]">Connecting Devotees with Divinity</p>
          </div>

          {/* Link columns — size to their content so full labels show (no truncation
              that would make "… Vrund — Android" and "… — iPhone" look identical). */}
          <div className="flex flex-col gap-10 sm:flex-row sm:gap-12 lg:gap-16">
            {SECTIONS.map((sec) => (
              <div key={sec.title}>
                <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-[#FFB27D]">{sec.title}</h3>
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
                          <span className="whitespace-nowrap">{l.label}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 text-white/30 group-hover:text-white/60" />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10 pt-6">
          <p className="text-xs text-white/50">© {new Date().getFullYear()} Akshar Connect · Adajan Satsang Mandal</p>
          <p className="text-xs text-white/60 flex items-center gap-1.5">
            Made with <Heart className="h-3.5 w-3.5 text-[#FF862A] fill-[#FF862A]" /> for satsang · <span className="text-[#FFC79A] font-semibold">Jai Swaminarayan</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
