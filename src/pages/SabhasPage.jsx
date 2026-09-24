import React, { useState, useEffect } from 'react';
import { CalendarCheck, Plus, CheckCircle2, Circle, Search, X, UserCheck, Sparkles } from 'lucide-react';
import { dataService } from '../services/dataService';

export default function SabhasPage({ user }) {
  const [sabhas, setSabhas] = useState([]);
  const [devotees, setDevotees] = useState([]);
  const [activeSabha, setActiveSabha] = useState(null);
  const [attendanceState, setAttendanceState] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New Sabha Form State
  const [newSabha, setNewSabha] = useState({
    title: '',
    date: new Date().toISOString().split('T')[0],
    time: '06:00 PM',
    venue: 'Akshar Hall, Ahmedabad',
    type: 'Sabha'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const s = dataService.getSabhas();
    const d = dataService.getDevotees();
    setSabhas(s);
    setDevotees(d);
  };

  const handleOpenAttendance = (sabha) => {
    setActiveSabha(sabha);
    const existingLogs = dataService.getAttendanceForSabha(sabha.id);
    const state = {};
    devotees.forEach(dev => {
      const found = existingLogs.find(l => l.devoteeId === dev.id);
      state[dev.id] = found ? found.present : false;
    });
    setAttendanceState(state);
  };

  const toggleAttendance = (devoteeId) => {
    setAttendanceState(prev => ({
      ...prev,
      [devoteeId]: !prev[devoteeId]
    }));
  };

  const handleSaveAttendance = () => {
    if (!activeSabha) return;
    Object.keys(attendanceState).forEach(devId => {
      dataService.markAttendance(activeSabha.id, devId, attendanceState[devId]);
    });
    loadData();
    setActiveSabha(null);
    alert('Attendance saved successfully!');
  };

  const handleCreateSabha = (e) => {
    e.preventDefault();
    if (!newSabha.title) return;
    dataService.addSabha(newSabha);
    loadData();
    setShowCreateModal(false);
    setNewSabha({
      title: '',
      date: new Date().toISOString().split('T')[0],
      time: '06:00 PM',
      venue: 'Akshar Hall, Ahmedabad',
      type: 'Sabha'
    });
  };

  const filteredDevotees = devotees.filter(d =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.mobile.includes(searchQuery)
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#003158]">Sabhas & Attendance</h1>
          <p className="text-sm font-medium text-[#9BB5CB]">
            Schedule sabhas, mark manual attendance, and inspect present counts.
          </p>
        </div>

        {(user?.role === 'Admin' || user?.role === 'Sevak') && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-2xl bg-[#003158] px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#00223f] transition-all"
          >
            <Plus className="h-4 w-4" /> Schedule New Sabha
          </button>
        )}
      </div>

      {/* Sabhas List */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sabhas.map((sabha) => (
          <div
            key={sabha.id}
            className="rounded-3xl border border-[#E4EBF3] bg-white p-6 shadow-xs transition-all hover:border-[#003158] hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${sabha.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {sabha.status}
              </span>
              <span className="text-xs font-semibold text-[#9BB5CB]">{sabha.date}</span>
            </div>

            <h3 className="text-base font-bold text-[#003158] mb-1">{sabha.title}</h3>
            <p className="text-xs text-slate-500 mb-4">{sabha.time} • {sabha.venue}</p>

            <div className="pt-3 border-t border-[#F0F4F8] flex items-center justify-between">
              <div>
                <span className="text-lg font-extrabold text-[#003158]">{sabha.presentCount}</span>
                <span className="text-xs text-slate-400"> / {sabha.totalCount} Devotees</span>
              </div>

              <button
                onClick={() => handleOpenAttendance(sabha)}
                className="flex items-center gap-1.5 rounded-xl bg-[#003158] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#00223f]"
              >
                <UserCheck className="h-4 w-4" /> Mark Attendance
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Manual Attendance Marking Modal */}
      {activeSabha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-[#E0EAF4] pb-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-[#003158]">{activeSabha.title}</h2>
                <p className="text-xs text-slate-400">{activeSabha.date} • Check mark present devotees</p>
              </div>
              <button onClick={() => setActiveSabha(null)} className="text-[#9BB5CB] hover:text-[#003158]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative mb-3">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#9BB5CB]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search devotees..."
                className="w-full rounded-2xl border border-[#E0EAF4] bg-[#F0F4F8] pl-10 pr-4 py-2.5 text-xs font-semibold text-[#003158] outline-none"
              />
            </div>

            {/* Devotee Checklist */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredDevotees.map((dev) => {
                const isPresent = !!attendanceState[dev.id];
                return (
                  <div
                    key={dev.id}
                    onClick={() => toggleAttendance(dev.id)}
                    className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                      isPresent ? 'border-emerald-500 bg-emerald-50/50' : 'border-[#E4EBF3] bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={dev.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                        alt={dev.name}
                        className="h-9 w-9 rounded-xl object-cover"
                      />
                      <div>
                        <p className="text-xs font-bold text-[#003158]">{dev.name}</p>
                        <p className="text-[10px] text-slate-400">{dev.mobile} • {dev.wing}</p>
                      </div>
                    </div>

                    {isPresent ? (
                      <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                    ) : (
                      <Circle className="h-6 w-6 text-slate-300" />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-[#E0EAF4] pt-4 mt-4 flex items-center justify-between">
              <span className="text-xs font-bold text-[#003158]">
                {Object.values(attendanceState).filter(Boolean).length} / {devotees.length} Marked Present
              </span>
              <button
                onClick={handleSaveAttendance}
                className="rounded-2xl bg-[#003158] px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#00223f]"
              >
                Save Attendance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Sabha Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E0EAF4] pb-4 mb-4">
              <h2 className="text-lg font-bold text-[#003158]">Schedule Sabha</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-[#9BB5CB] hover:text-[#003158]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSabha} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#003158] mb-1">Sabha Title *</label>
                <input
                  type="text"
                  required
                  value={newSabha.title}
                  onChange={(e) => setNewSabha({ ...newSabha, title: e.target.value })}
                  placeholder="e.g. Weekly Yuva Sabha"
                  className="w-full rounded-2xl border border-[#E0EAF4] p-3 text-xs font-semibold outline-none focus:border-[#003158]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#003158] mb-1">Date</label>
                  <input
                    type="date"
                    value={newSabha.date}
                    onChange={(e) => setNewSabha({ ...newSabha, date: e.target.value })}
                    className="w-full rounded-2xl border border-[#E0EAF4] p-3 text-xs font-semibold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#003158] mb-1">Time</label>
                  <input
                    type="text"
                    value={newSabha.time}
                    onChange={(e) => setNewSabha({ ...newSabha, time: e.target.value })}
                    placeholder="e.g. 06:00 PM"
                    className="w-full rounded-2xl border border-[#E0EAF4] p-3 text-xs font-semibold outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#003158] mb-1">Venue</label>
                  <input
                    type="text"
                    value={newSabha.venue}
                    onChange={(e) => setNewSabha({ ...newSabha, venue: e.target.value })}
                    placeholder="e.g. Akshar Hall"
                    className="w-full rounded-2xl border border-[#E0EAF4] p-3 text-xs font-semibold outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#003158] mb-1">Type</label>
                  <select
                    value={newSabha.type}
                    onChange={(e) => setNewSabha({ ...newSabha, type: e.target.value })}
                    className="w-full rounded-2xl border border-[#E0EAF4] p-3 text-xs font-semibold outline-none bg-white"
                  >
                    {['Sabha', 'Seva', 'Event', 'Padhramani'].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl bg-[#003158] py-3 text-xs font-bold text-white shadow-md hover:bg-[#00223f] mt-2"
              >
                Create Sabha
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
