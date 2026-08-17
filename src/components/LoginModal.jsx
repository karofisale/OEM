import React, { useState } from 'react';
import { ShieldCheck, User, Lock, Sparkles, Check, Key } from 'lucide-react';

export default function LoginModal({ users, activeUser, onSelectUser, onClose }) {
  const [pinInput, setPinInput] = useState('');
  const [selectedUserIndex, setSelectedUserIndex] = useState(0);

  const getRoleBadge = (role) => {
    switch (role) {
      case 'creator': return { label: '👑 Creator (Toàn quyền)', color: 'badge-amber' };
      case 'admin': return { label: '🛡️ Admin (Toàn quyền)', color: 'badge-purple' };
      case 'leader': return { label: '📊 Leader (Xem toàn bộ - Read-only)', color: 'badge-blue' };
      case 'sale': default: return { label: '💼 Sale (Phân quyền KH)', color: 'badge-emerald' };
    }
  };

  const handleConfirmLogin = (e) => {
    e.preventDefault();
    const u = users[selectedUserIndex];
    onSelectUser(u);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="glass-card animate-fade-in" style={{ width: '480px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid var(--karofi-cyan-border)' }}>
        
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
            Đăng Nhập & Phân Quyền Hống Karofi OEM
          </h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Vui lòng chọn tài khoản người dùng và vai trò làm việc
          </p>
        </div>

        {/* User Selection List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
          {users.map((u, idx) => {
            const badge = getRoleBadge(u.role);
            const isSelected = selectedUserIndex === idx;

            return (
              <div
                key={u.name}
                onClick={() => setSelectedUserIndex(idx)}
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
                placeholder="Nhập mã PIN (Mặc định: 123456)"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary" style={{ flex: 1 }}>
              Đóng
            </button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
              <ShieldCheck size={18} /> Đăng Nhập Hệ Thống
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
