import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { StatusMessages } from "../components/StatusMessages";
import { api } from "../lib/api";
import type { ClassDashboard, ConceptInsightsResponse, RiskSignalsResponse } from "../lib/api";
import { useTeacher } from "../contexts/TeacherContext";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

function riskTypeTagClass(riskType: string): string {
  const normalized = riskType.trim().toLowerCase();
  if (normalized === "critical") return "risk-tag risk-tag-critical";
  if (normalized === "declining") return "risk-tag risk-tag-declining";
  if (normalized === "low avg") return "risk-tag risk-tag-low-avg";
  return "risk-tag risk-tag-other";
}

export function AnalyticsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { classes, selectedClassId, setSelectedClassId } = useTeacher();
  const [dashboard, setDashboard] = useState<ClassDashboard | null>(null);
  const [concepts, setConcepts] = useState<ConceptInsightsResponse | null>(null);
  const [riskSignals, setRiskSignals] = useState<RiskSignalsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const classFromQuery = searchParams.get("classId");
    if (classFromQuery && classes.length > 0) {
      const parsedId = Number(classFromQuery);
      if (classes.some((item) => item.id === parsedId)) {
        setSelectedClassId(parsedId);
      }
    }
  }, [searchParams, classes, setSelectedClassId]);

  useEffect(() => {
    if (!selectedClassId) return;

    const load = async () => {
      try {
        setLoading(true);
        const [dashboardData, conceptData, riskData] = await Promise.all([
          api.getClassDashboard(selectedClassId),
          api.getConceptInsights(selectedClassId),
          api.getRiskSignals(selectedClassId),
        ]);
        setDashboard(dashboardData);
        setConcepts(conceptData);
        setRiskSignals(riskData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load analytics.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedClassId]);

  const activeSignals = useMemo(
    () => riskSignals?.signals.filter((student) => student.risk_level !== "low") ?? [],
    [riskSignals]
  );

  return (
    <section>
      <PageHeader
        title="Class Insights"
        subtitle="Performance trend, risk alerts, and concept-level gaps."
        actions={classes.length > 0 ? (
          <select
            className="select"
            value={selectedClassId ?? ""}
            onChange={(event) => setSelectedClassId(Number(event.target.value))}
          >
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.subject})
              </option>
            ))}
          </select>
        ) : null}
      />
      <StatusMessages loading={loading} loadingText="Loading analytics..." error={error} />

      {!loading && !error && dashboard && concepts && riskSignals && (
        <div className="stack">
          <div className="grid-2">
            <article className="card">
              <h3>Performance Overview</h3>
              <div className="line-chart" style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboard.trend.map((t, i) => ({
                    name: t.assignment_title || `A${i+1}`,
                    score: t.average_score_pct
                  }))}>
                    <XAxis dataKey="name" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#151522', borderColor: '#2f2f44', borderRadius: '10px', color: '#f8f8fb' }}
                      itemStyle={{ color: '#cdd0f5' }}
                    />
                    <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="muted">Class average trend across assignments.</p>
            </article>

            <article className="card">
              <h3>Score Distribution</h3>
              <div className="stack-sm">
                {dashboard.score_distribution.map((band) => {
                  const maxCount = Math.max(...dashboard.score_distribution.map((item) => item.count), 1);
                  const width = Math.round((band.count / maxCount) * 100);
                  return (
                    <div key={band.label}>
                      <div className="row row-space">
                        <span>{band.label}</span>
                        <strong>{band.count}</strong>
                      </div>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          </div>

          <article className="card">
            <h3>Risk Alerts</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Risk Type</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {activeSignals.map((student) => (
                    <tr
                      key={student.student_id}
                      className="table-row-click"
                      onClick={() => navigate(`/students/${student.student_id}?classId=${selectedClassId}`)}
                    >
                      <td>{student.student_name}</td>
                      <td>
                        <span className={riskTypeTagClass(student.risk_type)}>{student.risk_type}</span>
                      </td>
                      <td>{student.reason}</td>
                    </tr>
                  ))}
                {activeSignals.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted">No active risk alerts.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </article>

          <article className="card">
            <h3>Unit-Level Insights</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Concept</th>
                  <th>Class Avg</th>
                  <th>Weakness Level</th>
                </tr>
              </thead>
              <tbody>
                {concepts.concepts.map((concept) => (
                  <tr key={concept.concept}>
                    <td>{concept.concept}</td>
                    <td>{concept.average_score_pct}%</td>
                    <td className={concept.weakness_level === "high" ? "text-danger" : concept.weakness_level === "medium" ? "text-warn" : "text-ok"}>
                      {concept.weakness_level.toUpperCase()}
                    </td>
                  </tr>
                ))}
                {concepts.concepts.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted">
                      No concept-level data available yet for this class.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </article>
        </div>
      )}
    </section>
  );
}
