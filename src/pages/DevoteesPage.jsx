import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Filter,
  QrCode,
  Edit2,
  Trash2,
  X,
  MapPin,
  Phone,
  Briefcase,
  Droplet,
  Calendar,
  Sparkles,
  UserCheck
} from 'lucide-react';
import { dataService } from '../services/dataService';

export default function DevoteesPage({ user }) {
  const [devotees, setDevotees] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMandal, setSelectedMandal] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDevotee, setSelectedDevotee] = useState(null);
  const [qrModalDevotee, setQrModalDevotee] = useState(null);

  // New Devotee Form State
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    mandal: 'Akshar Mandal Ahmedabad',
    wing: 'Yuva Wing',
    area: '',
    city: 'Ahmedabad',
    bloodGroup: 'B+',
    dob: '',
    occupation: ''
  });

  useEffect(() => {
    loadDevotees();
  }, []);

  const loadDevotees = () => {
    setDevotees(dataService.getDevotees());
  };

  const mandalOptions = ['All', 'Akshar Mandal Ahmedabad', 'Akshar Mandal Vadodara', 'Akshar Mandal Surat'];

  const filteredDevotees = devotees.filter((d) => {
    const matchesSearch =
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.mobile.includes(searchQuery) ||
      d.city.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMandal = selectedMandal === 'All' || d.mandal === selectedMandal;
    return matchesSearch && matchesMandal;
  });

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.mobile) return;
    dataService.addDevotee(formData);
    loadDevotees();
    setShowAddModal(false);
    setFormData({
      name: '',
      mobile: '',
      mandal: 'Akshar Mandal Ahmedabad',
      wing: 'Yuva Wing',
      area: '',
      city: 'Ahmedabad',
      bloodGroup: 'B+',
      dob: '',
      occupation: ''
    });
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this devotee record?')) {
      dataService.deleteDevotee(id);
      loadDevotees();
      setSelectedDevotee(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#003158]">Devotee Directory</h1>
          <p className="text-sm font-medium text-[#9BB5CB]">
            Manage Satsangi members, view profiles, and generate QR passes.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-2xl bg-[#003158] px-4 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[#00223f] transition-all"
        >
          <Plus className="h-4 w-4" /> Add New Devotee
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#9BB5CB]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, mobile, or city..."
            className="w-full rounded-2xl border border-[#E0EAF4] bg-white pl-10 pr-4 py-2.5 text-sm font-semibold text-[#003158] outline-none focus:border-[#003158]"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[#9BB5CB]" />
          <select
            value={selectedMandal}
            onChange={(e) => setSelectedMandal(e.target.value)}
            className="rounded-2xl border border-[#E0EAF4] bg-white px-3 py-2.5 text-xs font-bold text-[#003158] outline-none"
          >
            {mandalOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Devotees Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredDevotees.map((devotee) => (
          <div
            key={devotee.id}
            className="rounded-3xl border border-[#E4EBF3] bg-white p-5 shadow-xs transition-all hover:border-[#003158] hover:shadow-md relative"
          >
            <div className="flex items-start gap-4">
              <img
                src={devotee.avatar || 'https://ui-avatars.com/api/?background=003158&color=fff&bold=true&name='+encodeURIComponent(devotee.name||'?')}
                alt={devotee.name}
                className="h-14 w-14 rounded-2xl object-cover border border-[#E4EBF3]"
              />

              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-[#FF862A] uppercase tracking-wider block">
                  {devotee.wing}
                </span>
                <h3 className="text-base font-bold text-[#003158] truncate">{devotee.name}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <Phone className="h-3 w-3 text-[#9BB5CB]" /> {devotee.mobile}
                </p>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 text-[#9BB5CB]" /> {devotee.area}, {devotee.city}
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#F0F4F8] flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                Attendance: {devotee.attendanceRate}%
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQrModalDevotee(devotee)}
                  title="View QR Code Pass"
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-[#FF862A] hover:bg-amber-100"
                >
                  <QrCode className="h-4 w-4" />
                </button>

                <button
                  onClick={() => setSelectedDevotee(devotee)}
                  className="rounded-xl border border-[#E4EBF3] px-3 py-1 text-xs font-bold text-[#003158] hover:bg-[#F0F4F8]"
                >
                  View Profile
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Devotee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E0EAF4] pb-4 mb-4">
              <h2 className="text-lg font-bold text-[#003158]">Add New Devotee</h2>
              <button onClick={() => setShowAddModal(false)} className="text-[#9BB5CB] hover:text-[#003158]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#003158] mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Ramesh Patel"
                  className="w-full rounded-2xl border border-[#E0EAF4] p-3 text-xs font-semibold outline-none focus:border-[#003158]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#003158] mb-1">Mobile *</label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value.replace(/\D/g, '') })}
                    placeholder="10-digit mobile"
                    className="w-full rounded-2xl border border-[#E0EAF4] p-3 text-xs font-semibold outline-none focus:border-[#003158]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#003158] mb-1">Wing</label>
                  <select
                    value={formData.wing}
                    onChange={(e) => setFormData({ ...formData, wing: e.target.value })}
                    className="w-full rounded-2xl border border-[#E0EAF4] p-3 text-xs font-semibold outline-none"
                  >
                    <option value="Yuva Wing">Yuva Wing</option>
                    <option value="Kishore Wing">Kishore Wing</option>
                    <option value="Bal Wing">Bal Wing</option>
                    <option value="Seniors Wing">Seniors Wing</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#003158] mb-1">Area</label>
                  <input
                    type="text"
                    value={formData.area}
                    onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                    placeholder="e.g. Vastrapur"
                    className="w-full rounded-2xl border border-[#E0EAF4] p-3 text-xs font-semibold outline-none focus:border-[#003158]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#003158] mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="e.g. Ahmedabad"
                    className="w-full rounded-2xl border border-[#E0EAF4] p-3 text-xs font-semibold outline-none focus:border-[#003158]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl bg-[#003158] py-3 text-xs font-bold text-white shadow-md hover:bg-[#00223f] mt-2"
              >
                Save Devotee
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Devotee Profile Modal */}
      {selectedDevotee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedDevotee(null)}
              className="absolute right-4 top-4 text-[#9BB5CB] hover:text-[#003158]"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center">
              <img
                src={selectedDevotee.avatar || 'https://ui-avatars.com/api/?background=003158&color=fff&bold=true&name='+encodeURIComponent(selectedDevotee.name||'?')}
                alt={selectedDevotee.name}
                className="mx-auto h-20 w-20 rounded-3xl object-cover border-2 border-[#003158] shadow-md mb-3"
              />
              <h2 className="text-xl font-bold text-[#003158]">{selectedDevotee.name}</h2>
              <span className="text-xs font-bold text-[#FF862A] bg-amber-50 px-3 py-1 rounded-full inline-block mt-1">
                {selectedDevotee.id} • {selectedDevotee.wing}
              </span>
            </div>

            <div className="mt-6 space-y-3 border-t border-[#F0F4F8] pt-4 text-xs font-semibold text-[#003158]">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F0F4F8]">
                <span className="text-slate-500">Mobile</span>
                <span>+91 {selectedDevotee.mobile}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F0F4F8]">
                <span className="text-slate-500">Mandal</span>
                <span>{selectedDevotee.mandal}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F0F4F8]">
                <span className="text-slate-500">Address</span>
                <span>{selectedDevotee.area}, {selectedDevotee.city}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#F0F4F8]">
                <span className="text-slate-500">Blood Group</span>
                <span>{selectedDevotee.bloodGroup || 'O+'}</span>
              </div>
            </div>

            {(user?.role === 'Admin' || user?.role === 'Sevak') && (
              <button
                onClick={() => handleDelete(selectedDevotee.id)}
                className="mt-6 w-full flex items-center justify-center gap-2 rounded-2xl bg-red-50 py-2.5 text-xs font-bold text-red-600 hover:bg-red-100"
              >
                <Trash2 className="h-4 w-4" /> Delete Devotee
              </button>
            )}
          </div>
        </div>
      )}

      {/* QR Code Pass Modal */}
      {qrModalDevotee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-center relative">
            <button
              onClick={() => setQrModalDevotee(null)}
              className="absolute right-4 top-4 text-[#9BB5CB] hover:text-[#003158]"
            >
              <X className="h-5 w-5" />
            </button>

            <span className="text-[10px] font-bold uppercase tracking-widest text-[#FF862A] block mb-1">
              Akshar Connect Pass
            </span>
            <h3 className="text-lg font-bold text-[#003158] mb-4">{qrModalDevotee.name}</h3>

            {/* Generated QR Placeholder / Code Display */}
            <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-2xl border-4 border-[#003158] bg-slate-950 p-4 shadow-inner">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrModalDevotee.id)}`}
                alt="QR Code"
                className="h-full w-full rounded-xl bg-white p-2"
              />
            </div>

            <p className="mt-4 text-xs font-bold text-[#003158]">{qrModalDevotee.id}</p>
            <p className="text-[11px] text-slate-400 mt-1">Scan this QR code at sabha entry for instant attendance</p>
          </div>
        </div>
      )}
    </div>
  );
}
