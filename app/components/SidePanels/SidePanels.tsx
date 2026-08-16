"use client";

import React from "react";
import { ProductPanels } from "../Panels/ProductPanels";
import "./SidePanels.css";

/**
 * Desktop side rails, shown only in swipe mode — in grid mode the markets
 * themselves fill the width and the rails have nothing to flank.
 *
 * These used to carry a crypto news feed. That was replaced with product
 * content for two reasons: the panels were louder than the app itself while
 * telling you nothing about your own position, and the news source
 * (min-api.cryptocompare.com) both blocks browser CORS and now answers 401
 * without an API key. The proxy at /api/news survives if the feed is ever
 * wanted again; the previous implementation is in git history.
 *
 * Content comes from ProductPanels, the same component used for the strip
 * above the market grid, so the two surfaces cannot drift apart.
 */
export function SidePanels() {
  return (
    <>
      <aside className="side-panel side-panel-left" aria-label="Your position">
        <div className="side-panel-content">
          <div className="side-panel-header">
            <h2 className="side-panel-title">Your Position</h2>
            <div className="side-panel-subtitle">Claims &amp; market</div>
          </div>
          <ProductPanels layout="rail" sections={["claim", "stats"]} />
        </div>
      </aside>

      <aside className="side-panel side-panel-right" aria-label="Recent activity">
        <div className="side-panel-content">
          <div className="side-panel-header">
            <h2 className="side-panel-title">Live Feed</h2>
            <div className="side-panel-subtitle">What just happened</div>
          </div>
          <ProductPanels layout="rail" sections={["activity"]} />
        </div>
      </aside>
    </>
  );
}

export default SidePanels;
