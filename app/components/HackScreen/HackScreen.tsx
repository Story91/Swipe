"use client";

import React, { useState, useEffect } from 'react';
import './HackScreen.css';

interface HackScreenProps {
  address: string;
}

export function HackScreen({ address }: HackScreenProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState(0);

  const messages = [
    "[*] ACCESS DENIED",
    "[*] UNAUTHORIZED DETECTED",
    `[!] WALLET: ${address.slice(0, 6)}...${address.slice(-4)}`,
    "[*] ANALYSIS COMPLETE",
    "[*] PATTERN RECOGNIZED",
    "[*] FARMER/BOT SIGNATURE IDENTIFIED",
    "",
    "[!] SYSTEM PROTECTION ACTIVATED",
    "[!] TERMINAL ACCESS REVOKED",
    "",
    "YOU HAVE BEEN FLAGGED",
    "",
    "SYSTEM: ACCESS DENIED",
    "SYSTEM: ACCESS DENIED",
    "SYSTEM: ACCESS DENIED",
    "",
    "[*] EXECUTION HALTED",
    "[*] INTERFACE LOCKED",
    "",
    "// This terminal has been compromised",
    "// Your activities have been logged",
    "// Return is not an option",
    "",
    "> CONNECTION TERMINATED <",
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      if (currentLine < messages.length) {
        setLines(prev => [...prev, messages[currentLine]]);
        setCurrentLine(prev => prev + 1);
      } else {
        clearInterval(interval);
      }
    }, 150);

    return () => clearInterval(interval);
  }, [currentLine, messages.length]);

  return (
    <div className="hack-screen">
      <div className="hack-overlay">
        <div className="hack-terminal">
          <div className="terminal-header">
            <div className="terminal-controls">
              <span className="control red"></span>
              <span className="control yellow"></span>
              <span className="control green"></span>
            </div>
            <div className="terminal-title">SYSTEM_TERMINAL.exe</div>
          </div>
          
          <div className="terminal-body">
            {lines.map((line, index) => (
              <div 
                key={index} 
                className={`terminal-line ${line.includes('DENIED') ? 'error' : ''} ${line.includes('FLAGGED') ? 'warning' : ''} ${line.startsWith('//') ? 'comment' : ''}`}
              >
                {line}
                {index === lines.length - 1 && <span className="cursor">█</span>}
              </div>
            ))}
            {currentLine >= messages.length && (
              <div className="terminal-line">
                <span className="cursor blink">█</span>
              </div>
            )}
          </div>
        </div>

        <div className="hack-glitch">
          <div className="glitch-text" data-text="ACCESS DENIED">
            ACCESS DENIED
          </div>
        </div>

        <div className="hack-matrix">
          {Array.from({ length: 50 }).map((_, i) => (
            <div key={i} className="matrix-char" style={{ 
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${5 + Math.random() * 10}s`
            }}>
              {String.fromCharCode(0x30A0 + Math.random() * 96)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

