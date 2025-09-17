'use client';

import React, { useState } from 'react';
import { useMiniKit } from '@coinbase/onchainkit/minikit';
import { notifyPredictionShared } from '@/lib/notification-helpers';

export default function NotificationTest() {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  const { context } = useMiniKit();

  const testNotification = async () => {
    setIsTesting(true);
    setTestResult('');

    try {
      console.log('Testing notification, context:', context);
      
      // Get FID from context
      let fid: number | null = null;
      
      // Try user.fid first (newer MiniKit versions)
      if (context?.user?.fid) {
        fid = context.user.fid;
      }
      // Fallback to client.fid (older versions)
      else if (context?.client && 'fid' in context.client) {
        fid = (context.client as any).fid;
      }

      if (!fid) {
        setTestResult('❌ No FID found in context. Make sure you are connected to Farcaster.');
        setIsTesting(false);
        return;
      }

      console.log('Found FID:', fid);

      // Test notification
      const result = await notifyPredictionShared(
        fid,
        'Test Prediction: Will BTC reach $100k?',
        'achievement'
      );

      if (result) {
        setTestResult('✅ Notification sent successfully! Check your Farcaster notifications.');
      } else {
        setTestResult('❌ Failed to send notification. Check console for details.');
      }

    } catch (error) {
      console.error('Test notification error:', error);
      setTestResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    setIsTesting(false);
  };

  const checkNotificationDetails = async () => {
    try {
      const response = await fetch('/api/debug-notifications');
      const data = await response.json();
      console.log('Notification details:', data);
      setTestResult(`🔍 Debug info: ${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      console.error('Debug error:', error);
      setTestResult(`❌ Debug failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="notification-test">
      <style jsx>{`
        .notification-test {
          padding: 20px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          margin: 20px 0;
        }
        
        .test-section {
          margin-bottom: 20px;
        }
        
        .test-button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          padding: 12px 24px;
          margin: 8px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.3s ease;
        }
        
        .test-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        
        .test-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
        
        .result {
          margin-top: 16px;
          padding: 12px;
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.2);
          font-family: 'Source Code Pro', monospace;
          font-size: 14px;
          white-space: pre-wrap;
          max-height: 200px;
          overflow-y: auto;
        }
        
        .context-info {
          background: rgba(0, 0, 0, 0.3);
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-family: 'Source Code Pro', monospace;
          font-size: 12px;
        }
      `}</style>
      
      <h3>🔔 Notification Test</h3>
      
      <div className="context-info">
        <strong>Context Info:</strong>
        <pre>{JSON.stringify(context, null, 2)}</pre>
      </div>
      
      <div className="test-section">
        <button 
          onClick={testNotification}
          disabled={isTesting}
          className="test-button"
        >
          {isTesting ? 'Testing...' : '🧪 Test Notification'}
        </button>
        
        <button 
          onClick={checkNotificationDetails}
          className="test-button"
        >
          🔍 Debug Notifications
        </button>
      </div>
      
      {testResult && (
        <div className="result">
          {testResult}
        </div>
      )}
      
      <div className="test-section">
        <h4>📋 Troubleshooting Steps:</h4>
        <ol>
          <li>Make sure you're using the app in Farcaster (not just browser)</li>
          <li>Enable notifications when prompted</li>
          <li>Check browser console for detailed logs</li>
          <li>Verify Redis connection is working</li>
          <li>Check if webhook endpoint is receiving frame events</li>
        </ol>
      </div>
    </div>
  );
}
