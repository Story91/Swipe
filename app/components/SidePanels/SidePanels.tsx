"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Clock, TrendingUp, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import "./SidePanels.css";

interface NewsItem {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
  categories?: string;
}

interface PredictionIdea {
  title: string;
  description: string;
  category: string;
}

const ITEMS_PER_PAGE = 2;
const LEFT_PANEL_FIRST_DELAY = 10000; // Left panel first change after 10 seconds
const LEFT_PANEL_INTERVAL = 20000; // Left panel changes every 20 seconds
const RIGHT_PANEL_FIRST_DELAY = 15000; // Right panel first change after 15 seconds
const RIGHT_PANEL_INTERVAL = 30000; // Right panel changes every 30 seconds

export function SidePanels() {
  const [leftNews, setLeftNews] = useState<NewsItem[]>([]);
  const [rightNews, setRightNews] = useState<NewsItem[]>([]);
  const [predictionIdeas, setPredictionIdeas] = useState<PredictionIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [leftPage, setLeftPage] = useState(0);
  const [rightPage, setRightPage] = useState(0);

  // Fetch crypto/blockchain news from RSS or free API
  useEffect(() => {
    const fetchNews = async () => {
      try {
        setLoading(true);
        
        // Using CryptoCompare free API for crypto news
        const cryptoResponse = await fetch(
          "https://min-api.cryptocompare.com/data/v2/news/?lang=EN&limit=10"
        );
        
        if (cryptoResponse.ok) {
          const cryptoData = await cryptoResponse.json();
          const newsItems: NewsItem[] = (cryptoData.Data || []).map((item: any) => {
            // CryptoCompare API returns imageurl field
            const imageUrl = item.imageurl || item.imageurl || null;
            console.log('News item:', { title: item.title, imageUrl });
            return {
              title: item.title || "No title",
              description: item.body?.substring(0, 150) || "No description",
              url: item.url || "#",
              source: item.source || "CryptoCompare",
              publishedAt: new Date(item.published_on * 1000).toISOString(),
              imageUrl: imageUrl,
              categories: item.categories || item.category || "General",
            };
          });
          
          // Split news between left and right panels
          const midPoint = Math.ceil(newsItems.length / 2);
          setLeftNews(newsItems.slice(0, midPoint));
          setRightNews(newsItems.slice(midPoint));
        } else {
          // Fallback: Generate sample prediction ideas if API fails
          generateFallbackContent();
        }
      } catch (error) {
        console.error("Error fetching news:", error);
        generateFallbackContent();
      } finally {
        setLoading(false);
      }
    };

    const generateFallbackContent = () => {
      // Fallback prediction ideas for inspiration
      const ideas: PredictionIdea[] = [
        {
          title: "Bitcoin ETF Approval",
          description: "Will Bitcoin spot ETF see $10B+ inflows in Q1 2025?",
          category: "Crypto"
        },
        {
          title: "Ethereum Layer 2 Growth",
          description: "Will total L2 TVL exceed $50B by end of 2025?",
          category: "DeFi"
        },
        {
          title: "AI Model Release",
          description: "Will OpenAI release GPT-5 before June 2025?",
          category: "Tech"
        },
        {
          title: "Base Ecosystem",
          description: "Will Base daily active users reach 1M by Q2 2025?",
          category: "Blockchain"
        },
        {
          title: "Regulatory Clarity",
          description: "Will US pass comprehensive crypto regulation in 2025?",
          category: "Regulation"
        }
      ];
      
      setPredictionIdeas(ideas);
      
      // Generate sample news items - different for left and right panels
      const allSampleNews: NewsItem[] = [
        {
          title: "Prediction Markets See Record Volume",
          description: "Decentralized prediction markets hit all-time high trading volume as more users discover the power of collective intelligence.",
          url: "#",
          source: "Market Insights",
          publishedAt: new Date().toISOString(),
          imageUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=200&fit=crop",
          categories: "Markets"
        },
        {
          title: "Base Network Activity Surges",
          description: "Base network continues to grow with increasing daily active users and transaction volume.",
          url: "#",
          source: "Blockchain News",
          publishedAt: new Date().toISOString(),
          imageUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=200&fit=crop",
          categories: "Blockchain"
        },
        {
          title: "AI Predictions Gain Traction",
          description: "Combining AI insights with prediction markets creates new opportunities for accurate forecasting.",
          url: "#",
          source: "Tech Trends",
          publishedAt: new Date().toISOString(),
          imageUrl: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=400&h=200&fit=crop",
          categories: "AI"
        },
        {
          title: "Crypto Regulation Updates",
          description: "New regulatory frameworks are shaping the future of cryptocurrency markets and prediction platforms.",
          url: "#",
          source: "Regulatory News",
          publishedAt: new Date().toISOString(),
          imageUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=200&fit=crop",
          categories: "Regulation"
        },
        {
          title: "DeFi Innovation Continues",
          description: "Decentralized finance platforms are introducing new prediction market mechanisms and liquidity solutions.",
          url: "#",
          source: "DeFi News",
          publishedAt: new Date().toISOString(),
          imageUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=200&fit=crop",
          categories: "DeFi"
        },
        {
          title: "NFT Market Trends",
          description: "Non-fungible tokens are finding new use cases in prediction markets and decentralized governance.",
          url: "#",
          source: "NFT Insights",
          publishedAt: new Date().toISOString(),
          imageUrl: "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=200&fit=crop",
          categories: "NFT"
        }
      ];
      
      // Split sample news between left and right panels
      const midPoint = Math.ceil(allSampleNews.length / 2);
      setLeftNews(allSampleNews.slice(0, midPoint));
      setRightNews(allSampleNews.slice(midPoint));
    };

    fetchNews();
    
    // Refresh news every 5 minutes
    const interval = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-change pages for left panel (first change after 10 seconds, then every 20 seconds)
  useEffect(() => {
    if (leftNews.length <= ITEMS_PER_PAGE) return;
    
    const totalPages = Math.ceil(leftNews.length / ITEMS_PER_PAGE);
    let intervalId: NodeJS.Timeout | null = null;
    
    // First change after 10 seconds
    const timeout = setTimeout(() => {
      setLeftPage(prev => (prev + 1) % totalPages);
      
      // Then continue every 20 seconds
      intervalId = setInterval(() => {
        setLeftPage(prev => (prev + 1) % totalPages);
      }, LEFT_PANEL_INTERVAL);
    }, LEFT_PANEL_FIRST_DELAY);
    
    return () => {
      clearTimeout(timeout);
      if (intervalId) clearInterval(intervalId);
    };
  }, [leftNews.length]);

  // Auto-change pages for right panel (first change after 15 seconds, then every 30 seconds)
  useEffect(() => {
    const totalItems = predictionIdeas.length > 0 ? predictionIdeas.length : rightNews.length;
    if (totalItems <= ITEMS_PER_PAGE) return;
    
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    let intervalId: NodeJS.Timeout | null = null;
    
    // First change after 15 seconds
    const timeout = setTimeout(() => {
      setRightPage(prev => (prev + 1) % totalPages);
      
      // Then continue every 30 seconds
      intervalId = setInterval(() => {
        setRightPage(prev => (prev + 1) % totalPages);
      }, RIGHT_PANEL_INTERVAL);
    }, RIGHT_PANEL_FIRST_DELAY);
    
    return () => {
      clearTimeout(timeout);
      if (intervalId) clearInterval(intervalId);
    };
  }, [predictionIdeas.length, rightNews.length]);

  const formatTimeAgo = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return "Recently";
      }
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    } catch {
      return "Recently";
    }
  };

  return (
    <>
      {/* Left Panel - News */}
      <aside className="side-panel side-panel-left">
        <div className="side-panel-content">
          <div className="side-panel-header">
            <h2 className="side-panel-title">Market News</h2>
            <div className="side-panel-subtitle">Stay informed</div>
          </div>
          
          <div className="side-panel-list">
            {loading ? (
              <Card className="side-panel-card-loading">
                <CardContent className="p-4 text-center">
                  <div className="animate-pulse">Loading news...</div>
                </CardContent>
              </Card>
            ) : leftNews.length > 0 ? (
              leftNews
                .slice(leftPage * ITEMS_PER_PAGE, (leftPage + 1) * ITEMS_PER_PAGE)
                .map((item, index) => (
                <Card 
                  key={index}
                  className="side-panel-card side-panel-card-news"
                  onClick={() => window.open(item.url, '_blank')}
                >
                  {item.imageUrl ? (
                    <div className="side-panel-card-image-wrapper">
                      <img 
                        src={item.imageUrl} 
                        alt={item.title}
                        className="side-panel-card-image"
                        loading="lazy"
                        onError={(e) => {
                          console.error('Image failed to load:', item.imageUrl);
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                        onLoad={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.opacity = '1';
                        }}
                        style={{ opacity: 0, transition: 'opacity 0.3s ease' }}
                      />
                      {/* Gradient Overlay */}
                      <div className="side-panel-card-image-gradient"></div>
                      {/* Top Corner Badges */}
                      <div className="side-panel-card-image-top-corners">
                        <Badge variant="outline" className="text-xs side-panel-badge-overlay side-panel-badge-top-left">
                          {item.source}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs side-panel-time-overlay side-panel-time-top-right">
                          <Clock className="h-3 w-3" />
                          {formatTimeAgo(item.publishedAt)}
                        </div>
                      </div>
                      {/* Text Overlay */}
                      <div className="side-panel-card-image-overlay">
                        <div className="side-panel-card-image-text">
                          <h3 className="side-panel-card-image-title line-clamp-2">
                            {item.title}
                          </h3>
                          {/* CREATE MARKET Badge */}
                          <div className="side-panel-create-market-badge-wrapper">
                            <div className="side-panel-create-market-badge">
                              <span className="side-panel-create-market-text">Create market about it</span>
                            </div>
                            <div className="side-panel-tooltip">Soon</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className="text-xs">
                            {item.source}
                          </Badge>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatTimeAgo(item.publishedAt)}
                          </div>
                        </div>
                        <CardTitle className="text-sm leading-tight line-clamp-2">
                          {item.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <CardDescription className="text-xs line-clamp-3">
                          {item.description}
                        </CardDescription>
                        <div className="flex items-center justify-end mt-3">
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </>
                  )}
                </Card>
              ))
            ) : (
              <Card className="side-panel-card-empty">
                <CardContent className="p-4 text-center text-muted-foreground">
                  No news available
                </CardContent>
              </Card>
            )}
          </div>
          
          {/* Pagination */}
          {leftNews.length > ITEMS_PER_PAGE && (
            <div className="side-panel-pagination">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLeftPage(prev => Math.max(0, prev - 1))}
                disabled={leftPage === 0}
                className="side-panel-pagination-btn"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <div className="side-panel-pagination-pages">
                {(() => {
                  const totalPages = Math.ceil(leftNews.length / ITEMS_PER_PAGE);
                  const currentPage = leftPage + 1;
                  
                  if (totalPages <= 1) return null;
                  
                  // Always show: [1] [middle] ... [last]
                  // Middle always shows current page (or 2 if page 1, or last-1 if last page)
                  // Elipsis always shown if totalPages > 3 (fixed position)
                  let middlePage = currentPage;
                  if (currentPage === 1 && totalPages > 2) {
                    middlePage = 2;
                  } else if (currentPage === totalPages && totalPages > 2) {
                    middlePage = totalPages - 1;
                  }
                  
                  // Always show ellipsis in the same position if more than 3 pages
                  const showEllipsis = totalPages > 3;
                  
                  return (
                    <>
                      <Button
                        variant={currentPage === 1 ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setLeftPage(0)}
                        className={`side-panel-pagination-page ${currentPage === 1 ? 'active' : ''}`}
                      >
                        1
                      </Button>
                      {totalPages > 2 && (
                        <>
                          {showEllipsis && (
                            <span className="side-panel-pagination-ellipsis">•••</span>
                          )}
                          <Button
                            variant={currentPage === middlePage ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setLeftPage(middlePage - 1)}
                            className={`side-panel-pagination-page ${currentPage === middlePage ? 'active' : ''}`}
                          >
                            {middlePage}
                          </Button>
                          {showEllipsis && (
                            <span className="side-panel-pagination-ellipsis">•••</span>
                          )}
                        </>
                      )}
                      {totalPages > 1 && (
                        <Button
                          variant={currentPage === totalPages ? "default" : "ghost"}
                          size="sm"
                          onClick={() => setLeftPage(totalPages - 1)}
                          className={`side-panel-pagination-page ${currentPage === totalPages ? 'active' : ''}`}
                        >
                          {totalPages}
                        </Button>
                      )}
                    </>
                  );
                })()}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLeftPage(prev => Math.min(Math.ceil(leftNews.length / ITEMS_PER_PAGE) - 1, prev + 1))}
                disabled={leftPage >= Math.ceil(leftNews.length / ITEMS_PER_PAGE) - 1}
                className="side-panel-pagination-btn"
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Right Panel - Prediction Ideas & Inspiration */}
      <aside className="side-panel side-panel-right">
        <div className="side-panel-content">
          <div className="side-panel-header">
            <h2 className="side-panel-title">Prediction Ideas</h2>
            <div className="side-panel-subtitle">Get inspired</div>
          </div>
          
          <div className="side-panel-list">
            {loading ? (
              <Card className="side-panel-card-loading">
                <CardContent className="p-4 text-center">
                  <div className="animate-pulse">Loading ideas...</div>
                </CardContent>
              </Card>
            ) : predictionIdeas.length > 0 ? (
              predictionIdeas
                .slice(rightPage * ITEMS_PER_PAGE, (rightPage + 1) * ITEMS_PER_PAGE)
                .map((idea, index) => (
                <Card 
                  key={index} 
                  className="side-panel-card side-panel-card-idea"
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-[#d4ff00]" />
                      <Badge variant="secondary" className="text-xs">
                        {idea.category}
                      </Badge>
                    </div>
                    <CardTitle className="text-sm leading-tight">
                      {idea.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <CardDescription className="text-xs">
                      {idea.description}
                    </CardDescription>
                    <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
                      <TrendingUp className="h-3 w-3" />
                      <span>Prediction idea</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : rightNews.length > 0 ? (
              rightNews
                .slice(rightPage * ITEMS_PER_PAGE, (rightPage + 1) * ITEMS_PER_PAGE)
                .map((item, index) => (
                <Card 
                  key={index}
                  className="side-panel-card side-panel-card-news"
                  onClick={() => window.open(item.url, '_blank')}
                >
                  {item.imageUrl ? (
                    <div className="side-panel-card-image-wrapper">
                      <img 
                        src={item.imageUrl} 
                        alt={item.title}
                        className="side-panel-card-image"
                        loading="lazy"
                        onError={(e) => {
                          console.error('Image failed to load:', item.imageUrl);
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                        onLoad={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.opacity = '1';
                        }}
                        style={{ opacity: 0, transition: 'opacity 0.3s ease' }}
                      />
                      {/* Gradient Overlay */}
                      <div className="side-panel-card-image-gradient"></div>
                      {/* Top Corner Badges */}
                      <div className="side-panel-card-image-top-corners">
                        <Badge variant="outline" className="text-xs side-panel-badge-overlay side-panel-badge-top-left">
                          {item.source}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs side-panel-time-overlay side-panel-time-top-right">
                          <Clock className="h-3 w-3" />
                          {formatTimeAgo(item.publishedAt)}
                        </div>
                      </div>
                      {/* Text Overlay */}
                      <div className="side-panel-card-image-overlay">
                        <div className="side-panel-card-image-text">
                          <h3 className="side-panel-card-image-title line-clamp-2">
                            {item.title}
                          </h3>
                          {/* CREATE MARKET Badge */}
                          <div className="side-panel-create-market-badge-wrapper">
                            <div className="side-panel-create-market-badge">
                              <span className="side-panel-create-market-text">Create market about it</span>
                            </div>
                            <div className="side-panel-tooltip">Soon</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline" className="text-xs">
                            {item.source}
                          </Badge>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatTimeAgo(item.publishedAt)}
                          </div>
                        </div>
                        <CardTitle className="text-sm leading-tight line-clamp-2">
                          {item.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <CardDescription className="text-xs line-clamp-3">
                          {item.description}
                        </CardDescription>
                        <div className="flex items-center justify-end mt-3">
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </>
                  )}
                </Card>
              ))
            ) : (
              <Card className="side-panel-card-empty">
                <CardContent className="p-4 text-center text-muted-foreground">
                  No content available
                </CardContent>
              </Card>
            )}
          </div>
          
          {/* Pagination */}
          {((predictionIdeas.length > 0 && predictionIdeas.length > ITEMS_PER_PAGE) || 
            (rightNews.length > 0 && rightNews.length > ITEMS_PER_PAGE)) && (
            <div className="side-panel-pagination">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRightPage(prev => Math.max(0, prev - 1))}
                disabled={rightPage === 0}
                className="side-panel-pagination-btn"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <div className="side-panel-pagination-pages">
                {(() => {
                  const totalPages = Math.ceil(
                    (predictionIdeas.length > 0 ? predictionIdeas.length : rightNews.length) / ITEMS_PER_PAGE
                  );
                  const currentPage = rightPage + 1;
                  
                  if (totalPages <= 1) return null;
                  
                  // Always show: [1] [middle] ... [last]
                  // Middle always shows current page (or 2 if page 1, or last-1 if last page)
                  // Elipsis always shown if totalPages > 3 (fixed position)
                  let middlePage = currentPage;
                  if (currentPage === 1 && totalPages > 2) {
                    middlePage = 2;
                  } else if (currentPage === totalPages && totalPages > 2) {
                    middlePage = totalPages - 1;
                  }
                  
                  // Always show ellipsis in the same position if more than 3 pages
                  const showEllipsis = totalPages > 3;
                  
                  return (
                    <>
                      <Button
                        variant={currentPage === 1 ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setRightPage(0)}
                        className={`side-panel-pagination-page ${currentPage === 1 ? 'active' : ''}`}
                      >
                        1
                      </Button>
                      {totalPages > 2 && (
                        <>
                          {showEllipsis && (
                            <span className="side-panel-pagination-ellipsis">•••</span>
                          )}
                          <Button
                            variant={currentPage === middlePage ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setRightPage(middlePage - 1)}
                            className={`side-panel-pagination-page ${currentPage === middlePage ? 'active' : ''}`}
                          >
                            {middlePage}
                          </Button>
                          {showEllipsis && (
                            <span className="side-panel-pagination-ellipsis">•••</span>
                          )}
                        </>
                      )}
                      {totalPages > 1 && (
                        <Button
                          variant={currentPage === totalPages ? "default" : "ghost"}
                          size="sm"
                          onClick={() => setRightPage(totalPages - 1)}
                          className={`side-panel-pagination-page ${currentPage === totalPages ? 'active' : ''}`}
                        >
                          {totalPages}
                        </Button>
                      )}
                    </>
                  );
                })()}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const totalItems = predictionIdeas.length > 0 ? predictionIdeas.length : rightNews.length;
                  setRightPage(prev => Math.min(Math.ceil(totalItems / ITEMS_PER_PAGE) - 1, prev + 1));
                }}
                disabled={rightPage >= Math.ceil(
                  (predictionIdeas.length > 0 ? predictionIdeas.length : rightNews.length) / ITEMS_PER_PAGE
                ) - 1}
                className="side-panel-pagination-btn"
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

