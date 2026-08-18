import React, { useState } from 'react';
import { KeyRound, Lock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import * as api from '../services/api';

export default function ChangePasswordModal({ token, onClose }) {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPin.length < 4) {
      setError('Mã PIN mới phải có ít nhất 4 ký tự.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('Mã PIN mới nhập lại không khớp.');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.changePassword(token, oldPin, newPin);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Đổi mã PIN thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="glass-card animate-fade-in" style={{ width: '420px', maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: '18px', border: '1px solid var(--karofi-cyan-border)' }}>

        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: 'linear-gradient(135deg, #00a0e9, #004e89)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(0, 160, 233, 0.3)', marginBottom: '12px'
          }}>
            <KeyRound size={32} color="#fff" />
          </div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
            Đổi Mã PIN
          </h2>
        </div>

        {success ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', fontWeight: 700 }}>
              <CheckCircle2 size={20} /> Đổi mã PIN thành công!
            </div>
            <button type="button" onClick={onClose} className="btn btn-primary" style={{ width: '100%' }}>
              Đóng
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Mã PIN hiện tại</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="password"
                  className="input-field"
                  style={{ paddingLeft: '38px' }}
                  placeholder="Nhập mã PIN hiện tại"
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Mã PIN mới</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="password"
                  className="input-field"
                  style={{ paddingLeft: '38px' }}
                  placeholder="Ít nhất 4 ký tự"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nhập lại mã PIN mới</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="password"
                  className="input-field"
                  style={{ paddingLeft: '38px' }}
                  placeholder="Nhập lại mã PIN mới"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '0.8rem', fontWeight: 600 }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>
                Hủy
              </button>
              <button type="submit" disabled={isSubmitting} className="btn btn-primary" style={{ flex: 2 }}>
                {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />}
                {isSubmitting ? 'Đang đổi...' : 'Đổi Mã PIN'}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
