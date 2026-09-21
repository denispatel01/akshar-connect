import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Download, Filter, Search, Table } from 'lucide-react';
import { dataService } from '../services/dataService';

export default function ReportsPage() {
  const [devotees, setDevotees] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setDevotees(dataService.getDevotees());
  }, []);

  const handleExportCSV = () => {
    const rows = devotees.map(d => ({
      ID: d.id,
      Name: d.name,
      Mobile: d.mobile,
      Mandal: d.mandal,
      Wing: d.wing,
      City: d.city,
      AttendanceRate: `${d.attendanceRate}%`,
      Status: d.status
    }));

    dataService.exportToCSV(`Akshar_Connect_Devotees_Report_${new Date().toISOString().split('T')[0]}.csv`, rows);
  };

  const filteredDevotees = devotees.filter(d =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.mobile.includes(searchQuery) ||
    d.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#003158]">Reports & Analytics</h1>
          <p className="text-sm font-medium text-[#9BB5CB]">
            Export devotee attendance summaries and inspect report data.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-emerald-700 transition-all"
        >
          <Download className="h-4 w-4" /> Export CSV / Excel
        </button>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#9BB5CB]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter report by name, mobile, city..."
          className="w-full rounded-2xl border border-[#E0EAF4] bg-white pl-10 pr-4 py-2.5 text-xs font-semibold text-[#003158] outline-none"
        />
      </div>

      {/* Devotees Report Table */}
      <div className="overflow-hidden rounded-3xl border border-[#E4EBF3] bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-semibold text-[#003158]">
            <thead className="bg-[#F0F4F8] text-[11px] uppercase tracking-wider text-[#9BB5CB] border-b border-[#E4EBF3]">
              <tr>
                <th className="px-6 py-4">Devotee ID</th>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Mobile</th>
                <th className="px-6 py-4">Mandal / Wing</th>
                <th className="px-6 py-4">City</th>
                <th className="px-6 py-4">Attendance Rate</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F8]">
              {filteredDevotees.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-bold text-[#FF862A]">{d.id}</td>
                  <td className="px-6 py-4 font-bold">{d.name}</td>
                  <td className="px-6 py-4 text-slate-500">+91 {d.mobile}</td>
                  <td className="px-6 py-4">
                    <span className="block text-slate-700">{d.mandal}</span>
                    <span className="text-[10px] text-slate-400">{d.wing}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{d.city}</td>
                  <td className="px-6 py-4 font-bold text-emerald-600">{d.attendanceRate}%</td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      d.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
