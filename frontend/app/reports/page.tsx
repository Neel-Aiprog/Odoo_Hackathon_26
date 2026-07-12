"use client";

import { useEffect, useState } from "react";
import { getMe, getReportsData, type ReportsResponse, type User } from "@/lib/api";
import { Sidebar } from "../Sidebar";

export default function ReportsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null));

    getReportsData()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleExport = () => {
    if (!data) return;
    setExporting(true);
    try {
      // Create CSV content
      let csvContent = "data:text/csv;charset=utf-8,";
      
      csvContent += "--- REPORT: ASSET UTILIZATION BY DEPARTMENT ---\n";
      csvContent += "Department,Active Allocations\n";
      data.utilization_by_department.forEach(d => {
        csvContent += `"${d.department}",${d.allocations}\n`;
      });

      csvContent += "\n--- REPORT: MOST USED ASSETS ---\n";
      csvContent += "Asset Name,Tag,Usage Count\n";
      data.most_used_assets.forEach(a => {
        csvContent += `"${a.name}","${a.tag}",${a.uses}\n`;
      });

      csvContent += "\n--- REPORT: IDLE ASSETS ---\n";
      csvContent += "Asset Name,Tag,Unused Days\n";
      data.idle_assets.forEach(a => {
        csvContent += `"${a.name}","${a.tag}",${a.unused_days}\n`;
      });

      csvContent += "\n--- REPORT: MAINTENANCE AND RETIREMENT ---\n";
      csvContent += "Asset Name,Tag,Alert/Reason\n";
      data.maintenance_retirement.forEach(a => {
        csvContent += `"${a.name}","${a.tag}","${a.reason}"\n`;
      });

      csvContent += "\n--- REPORT: MAINTENANCE FREQUENCY BY CATEGORY ---\n";
      csvContent += "Category,Maintenance Requests Count\n";
      data.maintenance_frequency.forEach(c => {
        csvContent += `"${c.category}",${c.count}\n`;
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `AssetFlow_Reports_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to export report", err);
    } finally {
      setTimeout(() => setExporting(false), 800);
    }
  };

  if (!user) return null;

  // Compute maximum values for charts scaling
  const maxDeptAlloc = data?.utilization_by_department.reduce((max, item) => Math.max(max, item.allocations), 1) ?? 1;
  const maxMaintCount = data?.maintenance_frequency.reduce((max, item) => Math.max(max, item.count), 1) ?? 1;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(48,82,62,0.35),_transparent_34%),linear-gradient(180deg,_#0f1110_0%,_#111412_100%)] px-4 py-6 text-stone-100 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1180px] overflow-hidden rounded-[2rem] border border-stone-200/60 bg-[#141714] shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
        <Sidebar currentItem="Reports" />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-stone-200/10 px-5 py-5 sm:px-6 lg:px-7">
            <h1 className="text-3xl font-semibold tracking-tight text-stone-50">Reports &amp; Analytics</h1>
            <p className="mt-1 text-sm text-stone-400">
              Actionable operational insights, trends, utilization metrics and lifecycle alerts.
            </p>
          </header>

          <div className="flex-1 overflow-auto p-5 lg:p-7 space-y-8">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-stone-400">Loading analytics data...</p>
              </div>
            ) : (
              <>
                {/* Upper Charts Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Utilization by Department Card */}
                  <div className="rounded-[1.5rem] border border-stone-200/10 bg-[#171b17] p-6 flex flex-col">
                    <h3 className="text-base font-semibold text-stone-300 mb-4">Utilization by department</h3>
                    
                    {/* SVG Bar Chart */}
                    <div className="flex-1 min-h-[200px] flex items-end justify-around gap-2 pt-6 border-b border-stone-200/10 pb-2 relative">
                      {data?.utilization_by_department.map((dept, index) => {
                        const heightPercent = Math.max((dept.allocations / maxDeptAlloc) * 100, 15);
                        return (
                          <div key={index} className="flex flex-col items-center flex-1 group">
                            {/* Value tooltip */}
                            <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity bg-stone-900 text-stone-100 text-xs rounded py-1 px-2 -translate-y-8 pointer-events-none border border-stone-700">
                              {dept.allocations} allocs
                            </div>
                            {/* Bar */}
                            <div 
                              style={{ height: `${heightPercent}%` }}
                              className="w-full max-w-[28px] rounded-t-lg bg-gradient-to-t from-emerald-600/40 to-emerald-400/90 border-t border-emerald-300/40 shadow-[0_0_15px_rgba(52,211,153,0.15)] transition-all duration-500 hover:brightness-125"
                            />
                            {/* Shortened dept label */}
                            <span className="text-[10px] text-stone-400 mt-2 text-center truncate max-w-full">
                              {dept.department}
                            </span>
                          </div>
                        );
                      })}
                      {(!data?.utilization_by_department || data.utilization_by_department.length === 0) && (
                        <p className="text-sm text-stone-500 pb-8">No department allocations</p>
                      )}
                    </div>
                  </div>

                  {/* Maintenance Frequency Card */}
                  <div className="rounded-[1.5rem] border border-stone-200/10 bg-[#171b17] p-6 flex flex-col">
                    <h3 className="text-base font-semibold text-stone-300 mb-4">Maintenance Frequency</h3>
                    
                    {/* Line Chart */}
                    <div className="flex-1 min-h-[200px] flex items-end justify-center pt-6 border-b border-stone-200/10 pb-2 relative">
                      <svg className="w-full h-[160px] overflow-visible" viewBox="0 0 300 120" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        
                        {/* Grid lines */}
                        <line x1="0" y1="30" x2="300" y2="30" stroke="#2e2e2e" strokeWidth="0.5" strokeDasharray="4" />
                        <line x1="0" y1="60" x2="300" y2="60" stroke="#2e2e2e" strokeWidth="0.5" strokeDasharray="4" />
                        <line x1="0" y1="90" x2="300" y2="90" stroke="#2e2e2e" strokeWidth="0.5" strokeDasharray="4" />

                        {/* Line Path */}
                        {data?.maintenance_frequency && data.maintenance_frequency.length > 0 && (() => {
                          const pts = data.maintenance_frequency.map((item, idx) => {
                            const x = (idx / Math.max(data.maintenance_frequency.length - 1, 1)) * 300;
                            const y = 100 - (item.count / maxMaintCount) * 80;
                            return { x, y, label: item.category, count: item.count };
                          });

                          const pathData = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
                          const areaData = `${pathData} L ${pts[pts.length - 1].x} 100 L ${pts[0].x} 100 Z`;

                          return (
                            <>
                              <path d={areaData} fill="url(#lineGrad)" />
                              <path d={pathData} fill="none" stroke="#ef4444" strokeWidth="2.5" className="drop-shadow-[0_2px_8px_rgba(239,68,68,0.4)]" />
                              
                              {/* Dots & tooltips */}
                              {pts.map((pt, index) => (
                                <g key={index} className="group/dot cursor-pointer">
                                  <circle cx={pt.x} cy={pt.y} r="4.5" fill="#171b17" stroke="#ef4444" strokeWidth="2" />
                                  <circle cx={pt.x} cy={pt.y} r="8" fill="transparent" />
                                  
                                  {/* Tooltip */}
                                  <foreignObject x={pt.x - 40} y={pt.y - 35} width="80" height="30" className="opacity-0 group-hover/dot:opacity-100 transition-opacity pointer-events-none">
                                    <div className="bg-stone-900 text-stone-100 text-[10px] text-center rounded border border-stone-700 py-0.5 px-1 font-semibold truncate">
                                      {pt.count} ({pt.label})
                                    </div>
                                  </foreignObject>
                                </g>
                              ))}
                            </>
                          );
                        })()}
                      </svg>
                      
                      {/* X-Axis labels */}
                      <div className="absolute bottom-[-16px] left-0 right-0 flex justify-between px-1">
                        {data?.maintenance_frequency.map((item, index) => (
                          <span key={index} className="text-[9px] text-stone-400">
                            {item.category}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lists Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Most Used Assets */}
                  <div className="space-y-3">
                    <h3 className="text-base font-semibold text-stone-50">Most used assets</h3>
                    <div className="space-y-2 rounded-2xl border border-stone-200/10 bg-[#171b17]/50 p-4 min-h-[120px]">
                      {data?.most_used_assets.map((asset, index) => (
                        <div key={index} className="flex justify-between items-center text-sm border-b border-stone-200/5 pb-2 last:border-0 last:pb-0">
                          <span className="text-stone-300">
                            {asset.name} <span className="text-xs text-stone-500 font-mono">({asset.tag})</span>
                          </span>
                          <span className="text-stone-400 font-medium">{asset.uses} uses</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Idle Assets */}
                  <div className="space-y-3">
                    <h3 className="text-base font-semibold text-stone-50">Idle assets</h3>
                    <div className="space-y-2 rounded-2xl border border-stone-200/10 bg-[#171b17]/50 p-4 min-h-[120px]">
                      {data?.idle_assets.map((asset, index) => (
                        <div key={index} className="flex justify-between items-center text-sm border-b border-stone-200/5 pb-2 last:border-0 last:pb-0">
                          <span className="text-stone-300">
                            {asset.name} <span className="text-xs text-stone-500 font-mono">({asset.tag})</span>
                          </span>
                          <span className="text-stone-500">unused {asset.unused_days}+ days</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Maintenance / Retirement Alerts */}
                <div className="space-y-3">
                  <h3 className="text-base font-semibold text-stone-50">Assets due for maintenance / nearing retirement</h3>
                  <div className="space-y-3 rounded-2xl border border-stone-200/10 bg-[#171b17]/50 p-5">
                    {data?.maintenance_retirement.map((item, index) => (
                      <div key={index} className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-sm border-b border-stone-200/5 pb-3 last:border-0 last:pb-0">
                        <span className="text-stone-200 font-medium">
                          {item.name} <span className="text-xs text-stone-500 font-mono">({item.tag})</span>
                        </span>
                        <span className="text-rose-400/90 text-xs sm:text-sm mt-1 sm:mt-0 font-medium">
                          {item.reason}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Export Report Action */}
                <div className="pt-2">
                  <button
                    onClick={handleExport}
                    disabled={exporting}
                    className="rounded-xl border border-rose-950/80 bg-rose-950/20 hover:bg-rose-950/45 px-6 py-2.5 text-sm font-semibold text-rose-300 transition-all shadow-[0_0_15px_rgba(239,68,68,0.05)] disabled:opacity-50"
                  >
                    {exporting ? "Exporting..." : "Export report"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
