'use client';

import React from 'react';
import { useViewProfile } from '@coinbase/onchainkit/minikit';
import { FarcasterProfile } from '../../../lib/hooks/useFarcasterProfiles';

interface SwiperAvatarProps {
  address: string;
  profile?: FarcasterProfile;
  index: number;
  isActive: boolean;
  onClick?: () => void;
}

export function SwiperAvatar({ address, profile, index, isActive, onClick }: SwiperAvatarProps) {
  const viewProfile = useViewProfile();

  // Generate a simple avatar based on address if no profile
  const getAvatarColor = (addr: string) => {
    const colors = [
      'bg-blue-500',
      'bg-green-500', 
      'bg-purple-500',
      'bg-pink-500',
      'bg-yellow-500',
      'bg-red-500',
      'bg-indigo-500',
      'bg-teal-500'
    ];
    const hash = addr.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
  };

  // Get initials from profile or address
  const getInitials = () => {
    if (profile?.display_name) {
      return profile.display_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return address.slice(2, 4).toUpperCase();
  };

  // Shorten address for display
  const shortenAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const handleClick = () => {
    if (onClick) {
      onClick();
    }
    
    console.log(`Viewing profile for address: ${address}`);
    
    try {
      if (profile?.fid) {
        console.log(`Opening Farcaster profile with FID: ${profile.fid}`);
        viewProfile(parseInt(profile.fid, 10));
      } else {
        // Fallback: convert address to a numeric FID-like value
        const addressHash = address.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
        }, 0);
        const mockFid = Math.abs(addressHash);
        
        console.log(`Attempting to view profile with mock FID: ${mockFid}`);
        viewProfile(mockFid);
      }
    } catch (error) {
      console.error('Error viewing profile:', error);
    }
  };

  return (
    <div 
      className={`swiper-avatar ${isActive ? 'active' : 'inactive'}`}
      onClick={handleClick}
      style={{ 
        left: `${(index % 6) * 16 + 2}%`,
        top: `${Math.floor(index / 6) * 30 + 5}px`,
        position: 'relative',
        animationDelay: `${index * 0.1}s`
      }}
      title={`View profile: ${profile?.display_name || shortenAddress(address)}`}
    >
      {profile?.pfp_url ? (
        <div className="avatar-circle avatar-image">
          <img 
            src={profile.pfp_url || undefined} 
            alt={profile.display_name || profile.username || 'Avatar'}
            className="avatar-img"
            onError={(e) => {
              // Fallback to initials if image fails to load
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent) {
                parent.innerHTML = `<span class="avatar-initials">${getInitials()}</span>`;
              }
            }}
          />
        </div>
      ) : (
        <div className={`avatar-circle ${getAvatarColor(address)}`}>
          <span className="avatar-initials">{getInitials()}</span>
        </div>
      )}
      {isActive && (
        <div className="avatar-tooltip">
          <div className="tooltip-header">
            <div className="tooltip-title">
              {profile?.display_name || 'Swiper Profile'}
            </div>
            <div className="tooltip-address">
              {profile?.username ? `@${profile.username}` : shortenAddress(address)}
            </div>
          </div>
          <div className="tooltip-content">
            <div className="tooltip-info">
              <span className="tooltip-label">Address:</span>
              <span className="tooltip-value">{address}</span>
            </div>
            {profile?.fid && (
              <div className="tooltip-info">
                <span className="tooltip-label">FID:</span>
                <span className="tooltip-value">{profile.fid}</span>
              </div>
            )}
            <div className="tooltip-info">
              <span className="tooltip-label">Status:</span>
              <span className="tooltip-value">Active Swiper</span>
            </div>
            <div className="tooltip-action">
              Click to view profile
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
