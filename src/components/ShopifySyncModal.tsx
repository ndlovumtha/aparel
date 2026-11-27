import React, { useState } from 'react';
import { ShopifyConfig, SyncLogEntry, Product } from '../types/store';
import {
  X,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Database,
  Terminal,
  Zap,
  Globe,
  Sliders,
  Radio,
} from 'lucide-react';

interface ShopifySyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ShopifyConfig;
  logs: SyncLogEntry[];
  products: Product[];
  onTriggerSync: () => Promise<void>;
  onSaveConfig: (updated: ShopifyConfig) => void;
  onTriggerWebhook: (type: 'inventory_reduced' | 'price_sync' | 'new_product', productId?: string) => void;
}

export const ShopifySyncModal: React.FC<ShopifySyncModalProps> = ({
  isOpen,
  onClose,
  config,
  logs,
  products,
  onTriggerSync,
  onSaveConfig,
  onTriggerWebhook,
}) => {
  const [domain, setDomain] = useState(config.storeDomain);
  const [token, setToken] = useState(config.storefrontAccessToken);
  const [apiVersion, setApiVersion] = useState(config.apiVersion);
  const [mode, setMode] = useState<'synced-cache' | 'live-shopify'>(config.mode);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedProductForWebhook, setSelectedProductForWebhook] = useState<string>(products[0]?.id || '');
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'config'>('overview');

  if (!isOpen) return null;

  const handleSync = async () => {
    setIsSyncing(true);
    await onTriggerSync();
    setIsSyncing(false);
  };

  const handleSaveSettings = () => {
    onSaveConfig({
      ...config,
      storeDomain: domain,
      storefrontAccessToken: token,
      apiVersion,
      mode,
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-center justify-center p-4 md:p-6">
      <div
        className="relative bg-[#0d0f14] border border-[#232934] w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#12151b] border-b border-[#1f242e] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#181d26] border border-[#2b3240] flex items-center justify-center text-[#ccff00]">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white uppercase tracking-tight flex items-center gap-2">
                <span>Shopify Synchronization Engine</span>
                <span className="text-[10px] font-mono font-normal bg-[#1a2212] text-[#ccff00] border border-[#ccff00]/30 px-1.5 py-0.5 uppercase">
                  Connected
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Headless Storefront API v{config.apiVersion} · Two-Way Catalog & Inventory Synchronization
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#1f242e] bg-[#0f1218] px-6 text-xs font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-4 border-b-2 uppercase tracking-wider transition-colors ${
              activeTab === 'overview'
                ? 'border-[#ccff00] text-white font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Sync Status & Webhooks
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-3 px-4 border-b-2 uppercase tracking-wider transition-colors ${
              activeTab === 'logs'
                ? 'border-[#ccff00] text-white font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Audit Log ({logs.length})
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`py-3 px-4 border-b-2 uppercase tracking-wider transition-colors ${
              activeTab === 'config'
                ? 'border-[#ccff00] text-white font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Storefront Credentials
          </button>
        </div>

        {/* Body content */}
        <div className="p-6 overflow-y-auto max-h-[70vh]">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Sync Status Banner */}
              <div className="p-4 bg-[#141720] border border-[#232936] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-[#ccff00]" />
                    <span className="text-sm font-semibold text-white">
                      Storefront Catalog Synchronized
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Host: <span className="text-slate-200 font-mono">{config.storeDomain}</span> ·{' '}
                    <span className="font-mono tabular-nums">{config.itemsCount} SKUs Active</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    Last sync handshake: {config.lastSyncedAt ? new Date(config.lastSyncedAt).toLocaleTimeString() : 'Just now'}
                  </p>
                </div>

                <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="px-5 py-2.5 bg-[#ccff00] hover:bg-[#b8e600] text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 shrink-0 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Synchronizing...' : 'Sync Catalog Now'}</span>
                </button>
              </div>

              {/* Webhook Simulator Section */}
              <div className="border border-[#1f242e] bg-[#0f1218] p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-[#ccff00]" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                    Simulate Real-Time Shopify Webhooks
                  </h4>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  Trigger incoming payloads to test instant storefront UI reaction, inventory updates, and price updates without manual reloads.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-[#141720] border border-[#222733] flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-semibold text-white block mb-1">
                        inventory_levels/connect
                      </span>
                      <p className="text-[11px] text-slate-400 mb-3">
                        Simulate Shopify deducting 1 unit of stock for a product line.
                      </p>
                    </div>
                    <button
                      onClick={() => onTriggerWebhook('inventory_reduced', selectedProductForWebhook)}
                      className="w-full py-2 bg-[#1f2430] hover:bg-[#2b3342] text-xs font-mono uppercase text-slate-200 border border-[#2f3747] transition-colors"
                    >
                      Emit Stock Decrement
                    </button>
                  </div>

                  <div className="p-3 bg-[#141720] border border-[#222733] flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-semibold text-white block mb-1">
                        products/update
                      </span>
                      <p className="text-[11px] text-slate-400 mb-3">
                        Simulate Shopify pushing a 5% promotional price discount.
                      </p>
                    </div>
                    <button
                      onClick={() => onTriggerWebhook('price_sync', selectedProductForWebhook)}
                      className="w-full py-2 bg-[#1f2430] hover:bg-[#2b3342] text-xs font-mono uppercase text-slate-200 border border-[#2f3747] transition-colors"
                    >
                      Emit Flash Price Sync
                    </button>
                  </div>
                </div>

                {/* Target SKU selector */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Target SKU:</span>
                  <select
                    value={selectedProductForWebhook}
                    onChange={(e) => setSelectedProductForWebhook(e.target.value)}
                    className="flex-1 bg-[#141720] border border-[#222733] text-white px-2 py-1 text-xs focus:outline-none"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} (${p.price} · Stock: {p.inventoryQuantity})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* GraphQL Architecture Diagram / Technical Specs */}
              <div className="p-4 bg-[#111319] border border-[#1d222b] text-xs space-y-2">
                <span className="text-slate-400 font-mono block uppercase text-[10px]">Architecture Specification</span>
                <p className="text-slate-300">
                  Offside Apparel operates as a fully headless storefront communicating with the Shopify Storefront GraphQL schema (`products`, `productByHandle`, `cartCreate`, and `checkoutCreate`).
                </p>
                <div className="flex flex-wrap gap-4 text-[11px] font-mono text-slate-400 pt-1">
                  <span>Transport: HTTPS GraphQL</span>
                  <span>·</span>
                  <span>Cache-Control: Stale-While-Revalidate</span>
                  <span>·</span>
                  <span>Payload: Strict Type JSON</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1f242e] text-slate-400 text-[11px]">
                <span>Timestamp & Event Type</span>
                <span>Audit Status</span>
              </div>
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 bg-[#12151b] border border-[#1b2029] flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-[11px] tabular-nums">{log.timestamp}</span>
                      <span className="font-bold text-slate-200">{log.event}</span>
                    </div>
                    <p className="text-slate-400 text-[11px] mt-1 font-sans">
                      {log.details}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 uppercase tracking-wider font-bold shrink-0 ${
                      log.status === 'success'
                        ? 'bg-[#152311] text-[#ccff00] border border-[#ccff00]/30'
                        : log.status === 'warning'
                        ? 'bg-[#291b10] text-amber-400 border border-amber-400/30'
                        : 'bg-[#141b26] text-blue-400 border border-blue-400/30'
                    }`}
                  >
                    {log.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'config' && (
            <div className="space-y-5 text-xs">
              <p className="text-slate-300">
                You can connect this React store directly to your own Shopify store! Enter your domain and Storefront Access Token below.
              </p>

              <div>
                <label className="block text-slate-400 uppercase font-medium mb-1">
                  Shopify Storefront Domain:
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="offside-apparel.myshopify.com"
                    className="w-full bg-[#141720] border border-[#222733] text-white pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-[#ccff00]"
                  />
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Example: your-custom-apparel.myshopify.com
                </span>
              </div>

              <div>
                <label className="block text-slate-400 uppercase font-medium mb-1">
                  Storefront Access Token:
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="shpat_..."
                  className="w-full bg-[#141720] border border-[#222733] text-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ccff00]"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Generated in Shopify Admin under Apps &gt; Headless Storefront Sales Channel
                </span>
              </div>

              <div>
                <label className="block text-slate-400 uppercase font-medium mb-1">
                  Storefront API Version:
                </label>
                <select
                  value={apiVersion}
                  onChange={(e) => setApiVersion(e.target.value)}
                  className="w-full bg-[#141720] border border-[#222733] text-white px-3 py-2 text-xs focus:outline-none"
                >
                  <option value="2024-01">2024-01 (Latest Stable)</option>
                  <option value="2024-04">2024-04 (Release Candidate)</option>
                </select>
              </div>

              <div className="pt-3">
                <button
                  onClick={handleSaveSettings}
                  className="px-6 py-2.5 bg-white hover:bg-slate-200 text-black font-bold uppercase tracking-wider text-xs transition-colors"
                >
                  Save Credentials
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#111319] border-t border-[#1f242e] flex items-center justify-between text-xs text-slate-400">
          <span>Headless GraphQL Architecture</span>
          <button
            onClick={onClose}
            className="text-white hover:underline uppercase font-medium"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
