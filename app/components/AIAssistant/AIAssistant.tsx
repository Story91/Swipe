"use client";

import { useState, useEffect } from 'react';
import { Bot, X, Loader2, Sparkles } from 'lucide-react';

interface AIAssistantProps {
  className?: string;
}

interface NewsEvent {
  title: string;
  description: string;
  category: string;
  impact: 'high' | 'medium' | 'low';
  timestamp: string;
  source?: string;
  isExpanded?: boolean;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AIAssistant({ className = '' }: AIAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [newsEvents, setNewsEvents] = useState<NewsEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'assistant',
      content: 'Hello! I\'m Swiper, your AI assistant for analyzing market events. In which category would you like me to search for the latest information? Available categories: Crypto, Sports, Politics, Entertainment, Technology, Finance, Weather, Science, Business, Other.',
      timestamp: new Date()
    }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [messageIdCounter, setMessageIdCounter] = useState(() => {
    // Use timestamp + random number to ensure uniqueness across sessions
    return Date.now() + Math.floor(Math.random() * 1000);
  });

  const toggleEventExpansion = (eventIndex: number) => {
    setNewsEvents(prev => prev.map((event, index) => 
      index === eventIndex 
        ? { ...event, isExpanded: !event.isExpanded }
        : event
    ));
  };

  const resetEvents = () => {
    setNewsEvents([]);
  };

  const fetchDailyEvents = async (category: string, userQuery: string) => {
    setIsSearching(true);
    setError(null);
    
    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 sekund timeout
      
      const response = await fetch('/api/ai-assistant/daily-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: category,
          userQuery: userQuery
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }
      
             const data = await response.json();
       // Add isExpanded property to new events
       const eventsWithExpansion = (data.events || []).map((event: NewsEvent) => ({
         ...event,
         isExpanded: false
       }));
       setNewsEvents(eventsWithExpansion);
      
             // Add assistant response to chat
       const assistantMessage: ChatMessage = {
         id: `assistant_${Date.now()}_${Math.random()}`,
         type: 'assistant',
         content: `I found ${data.events.length} events in the ${category} category. Here are the latest updates:`,
         timestamp: new Date()
       };
       setChatMessages(prev => [...prev, assistantMessage]);
      
        } catch (err) {
      let errorMessage = 'Sorry, an error occurred during the search. Please try again.';
      
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorMessage = 'Search timed out. Please try again with a more specific category.';
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
      
      // Add error message to chat
      const errorChatMessage: ChatMessage = {
        id: `assistant_${Date.now()}_${Math.random()}`,
        type: 'assistant',
        content: errorMessage,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorChatMessage]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleUserMessage = async () => {
    if (!userInput.trim()) return;
    
               // Add user message to chat
      const userMessage: ChatMessage = {
        id: `user_${Date.now()}_${Math.random()}`,
        type: 'user',
        content: userInput,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, userMessage]);
    
    const input = userInput.trim();
    setUserInput('');
    
    // Check if user wants to search in a specific category
    const categories = ['Crypto', 'Sports', 'Politics', 'Entertainment', 'Technology', 'Finance', 'Weather', 'Science', 'Business', 'Other'];
    const selectedCategory = categories.find(cat => 
      input.toLowerCase().includes(cat.toLowerCase())
    );
    
    if (selectedCategory) {
                             // Add thinking message
         const thinkingMessage: ChatMessage = {
           id: `assistant_${Date.now()}_${Math.random()}`,
           type: 'assistant',
           content: `🔍 Searching for latest events in the ${selectedCategory} category...`,
           timestamp: new Date()
         };
         setChatMessages(prev => [...prev, thinkingMessage]);
      
      // Fetch events for the selected category
      await fetchDailyEvents(selectedCategory, input);
    } else {
                             // Add assistant response for general queries
         const assistantMessage: ChatMessage = {
           id: `assistant_${Date.now()}_${Math.random()}`,
           type: 'assistant',
           content: 'In which category would you like me to search for information? Available categories: Crypto, Sports, Politics, Entertainment, Technology, Finance, Weather, Science, Business, Other.',
           timestamp: new Date()
         };
         setChatMessages(prev => [...prev, assistantMessage]);
    }
  };

    useEffect(() => {
    if (isOpen) {
      // Reset chat when opening
      setChatMessages([
        {
          id: '1',
          type: 'assistant',
          content: 'Hello! I\'m Swiper, your AI assistant for analyzing market events. In which category would you like me to search for the latest information? Available categories: Crypto, Sports, Politics, Entertainment, Technology, Finance, Weather, Science, Business, Other.',
          timestamp: new Date()
        }
      ]);
      setNewsEvents([]);
      setError(null);
             setMessageIdCounter(Date.now() + Math.floor(Math.random() * 1000)); // Reset counter when opening
    }
  }, [isOpen]);

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'text-red-500 bg-red-100 dark:bg-red-900/20';
      case 'medium': return 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900/20';
      case 'low': return 'text-green-500 bg-green-100 dark:bg-green-900/20';
      default: return 'text-gray-500 bg-gray-100 dark:bg-gray-900/20';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'crypto': return '₿';
      case 'economy': return '💰';
      case 'technology': return '💻';
      case 'politics': return '🏛️';
      case 'sports': return '⚽';
      case 'entertainment': return '🎬';
      case 'finance': return '💳';
      case 'weather': return '🌤️';
      case 'science': return '🔬';
      case 'business': return '💼';
      case 'other': return '📰';
      default: return '📰';
    }
  };

  return (
    <>
      {/* Floating AI Assistant Button */}
      <div className={`fixed bottom-6 right-6 z-50 ${className}`}>
        <button
          onClick={() => setIsOpen(true)}
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-110 group"
          aria-label="Open AI Assistant"
        >
          <Bot className="w-6 h-6" />
          <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
            <Sparkles className="w-3 h-3" />
          </div>
        </button>
      </div>

      {/* AI Assistant Modal */}
      {isOpen && (
                 <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-end p-4">
           <div className="bg-white dark:bg-gray-900 rounded-t-2xl w-full max-w-md h-[90vh] flex flex-col shadow-2xl">
            {/* Header */}
                         <div className="bg-gradient-to-r from-[#d4ff00] to-[#d4ff00] text-black p-4 flex items-center justify-between">
               <div className="flex items-center space-x-3">
                 <Bot className="w-6 h-6" />
                 <div>
                   <h3 className="font-semibold text-lg">Swiper</h3>
                   <p className="text-black text-sm">Live Market Events</p>
                 </div>
               </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

                         {/* Content */}
             <div className="flex flex-col flex-1 min-h-0">
               {/* Chat Messages */}
               <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 ${
                        message.type === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                
                                 {isSearching && (
                   <div className="flex justify-start">
                     <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-2">
                       <div className="flex items-center space-x-2">
                         <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                         <span className="text-sm text-gray-600 dark:text-gray-400">Searching...</span>
                       </div>
                     </div>
                   </div>
                 )}
              </div>

                             {/* Events Display */}
               {newsEvents.length > 0 && (
                 <div className="border-t border-gray-200 dark:border-gray-700 p-3">
                   <h4 className="font-semibold text-gray-900 dark:text-white text-xs mb-2">
                     📰 Found Events:
                   </h4>
                   <div className="space-y-2 max-h-[20vh] overflow-y-auto">
                    {newsEvents.map((event, index) => (
                                           <div
                       key={index}
                       className="border border-gray-200 dark:border-gray-700 rounded-lg p-2 hover:shadow-md transition-shadow"
                     >
                       <div className="flex items-start space-x-2">
                         <div className="text-lg flex-shrink-0">{getCategoryIcon(event.category)}</div>
                         <div className="flex-1 min-w-0">
                           <div className="flex flex-wrap items-center gap-1 mb-1">
                             <h5 className="font-semibold text-gray-900 dark:text-white text-xs leading-tight break-words">
                               {event.title}
                             </h5>
                             <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${getImpactColor(event.impact)}`}>
                               {event.impact.toUpperCase()}
                             </span>
                           </div>
                                                       <p className="text-gray-600 dark:text-gray-400 text-[10px] leading-tight break-words mb-1">
                              {event.description.length > 150 && !event.isExpanded 
                                ? `${event.description.substring(0, 150)}...` 
                                : event.description
                              }
                            </p>
                            {event.description.length > 150 && (
                              <button
                                onClick={() => toggleEventExpansion(index)}
                                className="text-blue-500 hover:text-blue-700 text-[9px] font-medium hover:underline cursor-pointer mb-1"
                              >
                                {event.isExpanded ? 'Show Less' : 'Show More'}
                              </button>
                            )}
                           <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-gray-500 dark:text-gray-500">
                             <span className="flex-shrink-0">{event.category}</span>
                             {event.source && (
                               <div className="text-blue-500 text-[10px] flex-shrink-0">
                                 {event.source === 'Live Web Search' ? '🔴 Live' : event.source}
                               </div>
                             )}
                           </div>
                         </div>
                       </div>
                     </div>
                    ))}
                  </div>
                </div>
              )}

                             {/* User Input */}
               <div className="border-t border-gray-200 dark:border-gray-700 p-4 flex-shrink-0">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleUserMessage()}
                                         placeholder="Enter category or question..."
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                    disabled={isSearching}
                  />
                  <button
                    onClick={handleUserMessage}
                    disabled={!userInput.trim() || isSearching}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                                         {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
                  </button>
                </div>
              </div>
            </div>

                           {/* Footer */}
               {/* Category Buttons */}
               <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                                  <div className="grid grid-cols-2 gap-1.5 mb-2">
                   {['Crypto', 'Sports', 'Politics', 'Entertainment', 'Technology', 'Finance', 'Weather', 'Science', 'Business', 'Other'].map((category) => (
                     <button
                       key={category}
                       onClick={() => {
                         const userMessage: ChatMessage = {
                           id: `user_${Date.now()}_${Math.random()}`,
                           type: 'user',
                           content: category,
                           timestamp: new Date()
                         };
                         setChatMessages(prev => [...prev, userMessage]);
                         
                         // Add thinking message
                         const thinkingMessage: ChatMessage = {
                           id: `assistant_${Date.now()}_${Math.random()}`,
                           type: 'assistant',
                           content: `🔍 Searching for latest events in the ${category} category...`,
                           timestamp: new Date()
                         };
                         setChatMessages(prev => [...prev, thinkingMessage]);
                         
                         // Fetch events for the selected category
                         fetchDailyEvents(category, category);
                       }}
                       className="px-2 py-1.5 bg-[#d4ff00] text-black rounded-lg hover:bg-[#b8e600] transition-colors text-[10px] font-medium leading-tight"
                     >
                       {category}
                     </button>
                   ))}
                 </div>
                 
                 <div className="flex justify-center">
                   <button
                     onClick={() => {
                                            setChatMessages([
                       {
                         id: '1',
                         type: 'assistant',
                         content: 'Hello! I\'m Swiper, your AI assistant for analyzing market events. In which category would you like me to search for the latest information? Available categories: Crypto, Sports, Politics, Entertainment, Technology, Finance, Weather, Science, Business, Other.',
                         timestamp: new Date()
                       }
                     ]);
                       setNewsEvents([]);
                       setMessageIdCounter(Date.now() + Math.floor(Math.random() * 1000)); // Reset counter when resetting chat
                     }}
                     className="text-[#d4ff00] hover:text-[#b8e600] font-medium text-sm"
                   >
                     Reset Chat
                   </button>
                 </div>
               </div>
          </div>
        </div>
      )}
    </>
  );
}
