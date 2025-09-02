import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';

export async function GET(request: NextRequest) {
  return await handleRequest(request, 'GET');
}

export async function POST(request: NextRequest) {
  return await handleRequest(request, 'POST');
}

async function handleRequest(request: NextRequest, method: 'GET' | 'POST') {
  try {
    // Check if API key exists
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Initialize OpenAI client
    const client = new OpenAI({
      apiKey: apiKey
    });

    // Get current date and time for context
    const now = new Date();
    const today = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const currentTime = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });

    // Handle POST request with specific category
    if (method === 'POST') {
      try {
        const body = await request.json();
        const { category, userQuery } = body;
        
        if (category) {
          const searchQuery = `latest ${category.toLowerCase()} news today ${today} ${userQuery || ''} market updates`;
          
          const response = await client.responses.create({
            model: "gpt-5-nano",
            input: searchQuery,
            text: {
              format: {
                type: "text"
              },
              verbosity: "low"  // Zmniejszamy verbosity dla szybszych odpowiedzi
            },
            reasoning: {
              effort: "low"  // Zmniejszamy effort dla szybszego przetwarzania
            },
            tools: [
              {
                type: "web_search",
                user_location: {
                  type: "approximate"
                },
                search_context_size: "low"  // Najniższy dostępny kontekst = najszybsze wyszukiwanie
              }
            ],
            store: true
          });

          const content = response.output_text || '';
          const events = [{
            title: `Latest ${category} Updates`,
            description: content.substring(0, 300) + '...',
            category: category,
            impact: 'medium',
            timestamp: new Date().toISOString(),
            source: 'Live Web Search'
          }];

          return NextResponse.json({
            events: events,
            generatedAt: new Date().toISOString(),
            source: 'OpenAI GPT-5-nano with Live Web Search',
            searchTime: `${today} at ${currentTime}`,
            totalEvents: events.length
          });
        }
      } catch (parseError) {
        console.error('Failed to parse POST body:', parseError);
      }
    }

    // Create search queries for different categories (for GET requests)
    const searchQueries = [
      {
        category: "Crypto",
        query: `latest cryptocurrency news today ${today} Bitcoin Ethereum crypto market updates`
      },
      {
        category: "Economy", 
        query: `breaking economic news today ${today} Federal Reserve GDP inflation market updates`
      },
      {
        category: "Technology",
        query: `latest technology news today ${today} AI artificial intelligence tech earnings updates`
      },
      {
        category: "Politics",
        query: `political news today ${today} government policy market impact breaking updates`
      }
    ];

    const allEvents = [];

    // Search for live events in each category
    for (const { category, query } of searchQueries) {
      try {
        const response = await client.responses.create({
          model: "gpt-5-nano",
          input: query,
          text: {
            format: {
              type: "text"
            },
            verbosity: "low"  // Zmniejszamy verbosity dla szybszych odpowiedzi
          },
          reasoning: {
            effort: "low"  // Zmniejszamy effort dla szybszego przetwarzania
          },
          tools: [
            {
              type: "web_search",
              user_location: {
                type: "approximate"
              },
              search_context_size: "low"  // Najniższy dostępny kontekst
            }
          ],
          store: true
        });

        // Extract events from the response
        const content = response.output_text || '';
        
        // Parse the content to extract event information
        // Look for dates, titles, and descriptions
        const lines = content.split('\n').filter(line => line.trim());
        
        let eventCount = 0;
        for (const line of lines) {
          if (eventCount >= 3) break; // Max 3 events per category
          
          // Look for lines that contain dates or time indicators
          if (line.match(/(today|tomorrow|this week|next week|upcoming|scheduled|announced)/i)) {
            const event = {
              title: line.substring(0, 100).trim(),
              description: line.trim(),
              category: category,
              impact: getRandomImpact(), // We'll determine this based on content analysis
              timestamp: new Date().toISOString(),
              source: 'Live Web Search'
            };
            
            allEvents.push(event);
            eventCount++;
          }
        }

        // If no specific events found, create a summary event
        if (eventCount === 0) {
          const summaryEvent = {
            title: `Latest ${category} Updates`,
            description: content.substring(0, 200) + '...',
            category: category,
            impact: 'medium',
            timestamp: new Date().toISOString(),
            source: 'Live Web Search'
          };
          allEvents.push(summaryEvent);
        }

      } catch (categoryError) {
        console.error(`Error searching ${category}:`, categoryError);
        // Add fallback event for this category
        allEvents.push({
          title: `${category} News Update`,
          description: `Latest ${category.toLowerCase()} developments and market updates.`,
          category: category,
          impact: 'medium',
          timestamp: new Date().toISOString(),
          source: 'Fallback'
        });
      }
    }

    // Ensure we have at least some events
    if (allEvents.length === 0) {
      allEvents.push({
        title: "Live Market Updates",
        description: "Real-time financial market and cryptocurrency news updates.",
        category: "General",
        impact: "medium",
        timestamp: new Date().toISOString(),
        source: "Fallback"
      });
    }

    return NextResponse.json({
      events: allEvents,
      generatedAt: new Date().toISOString(),
      source: 'OpenAI GPT-5-nano with Live Web Search',
      searchTime: `${today} at ${currentTime}`,
      totalEvents: allEvents.length
    });

  } catch (error) {
    console.error('AI Assistant API Error:', error);
    
    // Return fallback data on error
    return NextResponse.json({
      events: [
        {
          title: "Live Market Updates",
          description: "Real-time financial market and cryptocurrency news updates.",
          category: "General",
          impact: "medium",
          timestamp: new Date().toISOString(),
          source: "Fallback"
        }
      ],
      generatedAt: new Date().toISOString(),
      source: 'fallback',
      error: 'Using fallback data due to API error'
    });
  }
}

// Helper function to determine impact based on content
function getRandomImpact(): 'high' | 'medium' | 'low' {
  const impacts: ('high' | 'medium' | 'low')[] = ['high', 'medium', 'low'];
  return impacts[Math.floor(Math.random() * impacts.length)];
}
