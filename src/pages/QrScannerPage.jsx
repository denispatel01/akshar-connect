import React, { useState, useEffect, useRef } from 'react';
import { QrCode, CheckCircle, AlertCircle, Camera, Search, UserCheck } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { dataService } from '../services/dataService';

export default function QrScannerPage() {
  const [scannedResult, setScannedResult] = useState(null);
  const [manualId, setManualId] = useState('');
  const [sabhas, setSabhas] = useState([]);
  const [selectedSabhaId, setSelectedSabhaId] = useState('');
  const scannerRef = useRef(null);

  useEffect(() => {
    const sList = dataService.getSabhas();
    setSabhas(sList);
    if (sList.length > 0) setSelectedSabhaId(sList[0].id);

    // Initialize HTML5 QR Code Scanner
    const scanner = new Html5QrcodeScanner('qr-reader', {
      fps: 10,
      qrbox: { width: 250, height: 250 }
    });

    scanner.render(onScanSuccess, onScanError);
    scannerRef.current = scanner;

    return () => {
      scanner.clear().catch(() => {});
    };
  }, []);

  const onScanSuccess = (decodedText) => {
    processScannedCode(decodedText);
  };

  const onScanError = (err) => {
    // Silent fail for continuous frame scanning
  };

  const processScannedCode = (code) => {
    const devotees = dataService.getDevotees();
    const found = devotees.find(d => d.id === code || d.mobile === code);

    if (found) {
      dataService.markAttendance(selectedSabhaId, found.id, true);
      setScannedResult({
        success: true,
        devotee: found,
        message: `Attendance marked for ${found.name} (${found.id})`
      });
    } else {
      setScannedResult({
        success: false,
        message: `Unrecognized QR Code: ${code}`
      });
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualId) return;
    processScannedCode(manualId);
    setManualId('');
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#003158] text-white shadow-md">
          <QrCode className="h-6 w-6 text-[#FF862A]" />
        </div>
        <h1 className="text-2xl font-bold text-[#003158]">Sabha Entry QR Scanner</h1>
        <p className="text-sm font-medium text-[#9BB5CB] mt-0.5">
          Scan devotee QR code pass or enter Devotee ID manually
        </p>
      </div>

      {/* Select Active Sabha */}
      <div className="rounded-2xl border border-[#E0EAF4] bg-white p-4 max-w-md mx-auto flex items-center justify-between">
        <span className="text-xs font-bold text-[#003158]">Target Sabha:</span>
        <select
          value={selectedSabhaId}
          onChange={(e) => setSelectedSabhaId(e.target.value)}
          className="rounded-xl border border-[#E0EAF4] bg-[#F0F4F8] px-3 py-1.5 text-xs font-bold text-[#003158] outline-none"
        >
          {sabhas.map(s => (
            <option key={s.id} value={s.id}>{s.title} ({s.date})</option>
          ))}
        </select>
      </div>

      {/* Camera Viewport & QR Reader Container */}
      <div className="mx-auto max-w-md overflow-hidden rounded-3xl border-2 border-[#003158] bg-white p-4 shadow-xl">
        <div id="qr-reader" className="w-full"></div>
      </div>

      {/* Manual ID Search Backup */}
      <form onSubmit={handleManualSubmit} className="mx-auto max-w-md flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#9BB5CB]" />
          <input
            type="text"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="Enter DEV-1001 or mobile number..."
            className="w-full rounded-2xl border border-[#E0EAF4] bg-white pl-10 pr-4 py-2.5 text-xs font-semibold text-[#003158] outline-none focus:border-[#003158]"
          />
        </div>
        <button
          type="submit"
          className="rounded-2xl bg-[#003158] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#00223f]"
        >
          Verify
        </button>
      </form>

      {/* Scanned Result Toast / Notification */}
      {scannedResult && (
        <div className={`mx-auto max-w-md rounded-3xl p-5 shadow-lg border ${
          scannedResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'
        }`}>
          <div className="flex items-start gap-4">
            {scannedResult.success ? (
              <CheckCircle className="h-8 w-8 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-8 w-8 text-red-600 shrink-0" />
            )}

            <div>
              <h3 className="text-sm font-bold">{scannedResult.message}</h3>
              {scannedResult.devotee && (
                <div className="mt-2 text-xs space-y-0.5 text-slate-600 font-semibold">
                  <p>Wing: {scannedResult.devotee.wing}</p>
                  <p>Mandal: {scannedResult.devotee.mandal}</p>
                  <p>Mobile: +91 {scannedResult.devotee.mobile}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
