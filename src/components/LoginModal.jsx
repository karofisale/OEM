import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, Check, AlertCircle, Loader2 } from 'lucide-react';
import * as api from '../services/api';

export default function LoginModal({ onLoginSuccess, onClose, closable }) {
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [selectedUserIndex, setSelectedUserIndex] = useState(0);
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    api.getUserList()
      .then(setUsers)
      .catch(err => setUsersError(err.message || String(err)));
  }, []);

  const getRoleBadge = (role) => {
    switch (role) {
      case 'creator': return { label: '👑 Creator', color: 'badge-amber' };
      case 'admin': return { label: '🛡️ Admin', color: 'badge-purple' };
      case 'leader': return { label: '📊 Leader', color: 'badge-blue' };
      case 'sale': default: return { label: '💼 Sale', color: 'badge-emerald' };
    }
  };

  const handleConfirmLogin = async (e) => {
    e.preventDefault();
    const u = users[selectedUserIndex];
    if (!u || isSubmitting) return;
    setIsSubmitting(true);
    setLoginError('');
    try {
      const session = await api.login(u.name, pinInput);
      onLoginSuccess(session);
    } catch (err) {
      setLoginError(err.message || 'Đăng nhập thất bại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectUser = (idx) => {
    setSelectedUserIndex(idx);
    setPinInput('');
    setLoginError('');
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="glass-card animate-fade-in" style={{ width: '480px', maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid var(--karofi-cyan-border)' }}>

        {/* Modal Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: 'linear-gradient(135deg, #00a0e9, #004e89)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(0, 160, 233, 0.3)', marginBottom: '12px'
          }}>
            <ShieldCheck size={32} color="#fff" />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
            Đăng Nhập Hệ Thống Karofi OEM
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Chọn tài khoản và nhập mã PIN để tiếp tục
          </p>
        </div>

        {usersError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontSize: '0.8rem', fontWeight: 600 }}>
            <AlertCircle size={14} /> Không tải được danh sách tài khoản: {usersError}
          </div>
        )}

        {/* User Selection List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
          {users.map((u, idx) => {
            const badge = getRoleBadge(u.role);
            const isSelected = selectedUserIndex === idx;

            return (
              <div
                key={u.name}
                onClick={() => handleSelectUser(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: isSelected ? '2px solid var(--karofi-cyan)' : '1px solid var(--border-color)',
                  background: isSelected ? 'var(--karofi-cyan-light)' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: u.role === 'creator' ? '#f59e0b' : u.role === 'admin' ? '#8b5cf6' : u.role === 'leader' ? '#00a0e9' : '#10b981',
                    color: '#fff', fontWeight: 800, fontSize: '0.8rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {u.name[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {u.name}
                    </div>
                    <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                      {u.saleId ? `Sale: ${u.saleId}` : 'Ban Quản Lý'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`badge ${badge.color}`} style={{ fontSize: '0.7rem' }}>
                    {badge.label}
                  </span>
                  {isSelected && <Check size={16} color="var(--karofi-cyan)" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* PIN Input */}
        <form onSubmit={handleConfirmLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Mã PIN xác thực:</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="password"
                className="input-field"
                style={{ paddingLeft: '38px' }}
                placeholder="Nhập mã PIN"
                value={pinInput}
                onChange={(e) => { setPinInput(e.target.value); setLoginError(''); }}
              />
            </div>
            {loginError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', color: '#dc2626', fontSize: '0.8rem', fontWeight: 600 }}>
                <AlertCircle size={14} /> {loginError}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            {closable && (
              <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>
                Đóng
              </button>
            )}
            <button type="submit" disabled={isSubmitting || !users.length} className="btn btn-primary" style={{ flex: closable ? 2 : 1 }}>
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              {isSubmitting ? 'Đang đăng nhập...' : 'Đăng Nhập Hệ Thống'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
