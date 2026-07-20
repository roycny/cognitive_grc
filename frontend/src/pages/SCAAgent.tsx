import React, { useCallback, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Collapse,
    Divider,
    IconButton,
    MenuItem,
    Paper,
    Select,
    Snackbar,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tabs,
    Tab,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BugReportIcon from '@mui/icons-material/BugReport';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SaveIcon from '@mui/icons-material/Save';
import HistoryIcon from '@mui/icons-material/History';
import DeleteIcon from '@mui/icons-material/Delete';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AI_MODEL_KEY } from './SettingsPage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VulnerabilityItem {
    id: string;
    summary: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
    cvss_score: number | null;
    aliases: string[];
    references: string[];
}

interface VulnerablePackage {
    name: string;
    version: string;
    ecosystem: string;
    vulnerabilities: VulnerabilityItem[];
}

interface SCAScanResponse {
    filename: string;
    total_vulnerabilities: number;
    packages: VulnerablePackage[];
    scan_error: string | null;
}

interface SCAFinding {
    package_version: string;
    vulnerability_id: string;
    action_required: 'Must Fix' | 'Verify Reachability' | 'Ignore/Accept Risk';
    why: string;
    how_to_verify: string;
}

interface SCAAnalysis {
    summary: string;
    risk_level: string;
    recommendations: string[];
    findings: SCAFinding[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_DESCRIPTION = '.xml (Maven), .txt (pip), package-lock.json (npm), yarn.lock, poetry.lock, composer.lock (PHP), .json (GitHub SPDX SBOM)';

function isAllowedFile(filename: string): boolean {
    const name = filename.toLowerCase();
    return (
        name.endsWith('.xml') ||
        name.endsWith('.txt') ||
        name.endsWith('yarn.lock') ||
        name.endsWith('poetry.lock') ||
        name.endsWith('package-lock.json') ||
        name.endsWith('composer.lock') ||
        (name.endsWith('.json') && !name.endsWith('package-lock.json'))
    );
}

const SEVERITY_COLOR: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
    CRITICAL: 'error',
    HIGH: 'error',
    MEDIUM: 'warning',
    LOW: 'info',
    UNKNOWN: 'default',
};

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4 };

const RISK_PALETTE: Record<string, string> = {
    CRITICAL: '#B71C1C',
    HIGH:     '#E65100',
    MEDIUM:   '#F57F17',
    LOW:      '#0277BD',
    UNKNOWN:  '#546E7A',
};

const ACTION_COLOR: Record<string, 'error' | 'warning' | 'success'> = {
    'Must Fix':             'error',
    'Verify Reachability':  'warning',
    'Ignore/Accept Risk':   'success',
};

const ACTION_ORDER: Record<string, number> = {
    'Must Fix': 0, 'Verify Reachability': 1, 'Ignore/Accept Risk': 2,
};

/** The AI model selected in Settings (cloud "gemini-*" or local "ollama/<name>"). */
const getSavedModel = () => localStorage.getItem(AI_MODEL_KEY) || 'gemini-3.5-flash';

// ---------------------------------------------------------------------------
// PackageRow
// ---------------------------------------------------------------------------

function PackageRow({ pkg }: { pkg: VulnerablePackage }) {
    const [open, setOpen] = useState(false);
    const worstSeverity = pkg.vulnerabilities.reduce<string>((acc, v) =>
        (SEVERITY_ORDER[v.severity] ?? 4) < (SEVERITY_ORDER[acc] ?? 4) ? v.severity : acc, 'UNKNOWN');

    return (
        <>
            <TableRow hover onClick={() => setOpen(o => !o)}
                sx={{ cursor: 'pointer', '& > td': { borderBottom: open ? 0 : undefined } }}>
                <TableCell sx={{ width: 40, pr: 0 }}>
                    <IconButton size="small">{open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}</IconButton>
                </TableCell>
                <TableCell>
                    <Typography variant="body2" fontWeight={600}>{pkg.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{pkg.ecosystem}</Typography>
                </TableCell>
                <TableCell><Typography variant="body2" fontFamily="monospace">{pkg.version}</Typography></TableCell>
                <TableCell>
                    <Chip label={worstSeverity} color={SEVERITY_COLOR[worstSeverity]} size="small" sx={{ fontWeight: 700, minWidth: 80 }} />
                </TableCell>
                <TableCell align="right">
                    <Chip label={pkg.vulnerabilities.length} size="small" variant="outlined" />
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell colSpan={5} sx={{ py: 0 }}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ mx: 2, my: 1.5 }}>
                            {pkg.vulnerabilities
                                .slice().sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4))
                                .map(vuln => (
                                    <Paper key={vuln.id} variant="outlined"
                                        sx={{ p: 1.5, mb: 1, borderLeft: 4, borderColor: borderColorFor(vuln.severity) }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                                            <Typography variant="body2" fontWeight={700} fontFamily="monospace">{vuln.id}</Typography>
                                            <Chip label={vuln.severity} color={SEVERITY_COLOR[vuln.severity]} size="small" sx={{ fontWeight: 700 }} />
                                            {vuln.cvss_score !== null && (
                                                <Chip label={`CVSS ${vuln.cvss_score.toFixed(1)}`} size="small" variant="outlined" />
                                            )}
                                            {vuln.aliases.slice(0, 2).map(a => (
                                                <Chip key={a} label={a} size="small" variant="outlined" />
                                            ))}
                                        </Box>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{vuln.summary}</Typography>
                                        {vuln.references.length > 0 && (
                                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                                {vuln.references.slice(0, 3).map(url => (
                                                    <Tooltip key={url} title={url}>
                                                        <Button size="small" endIcon={<OpenInNewIcon fontSize="inherit" />}
                                                            href={url} target="_blank" rel="noopener noreferrer"
                                                            sx={{ fontSize: '0.7rem', p: '2px 6px', minWidth: 0 }}>
                                                            Reference
                                                        </Button>
                                                    </Tooltip>
                                                ))}
                                            </Box>
                                        )}
                                    </Paper>
                                ))}
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </>
    );
}

function borderColorFor(severity: string): string {
    switch (severity) {
        case 'CRITICAL': return 'error.main';
        case 'HIGH':     return 'error.light';
        case 'MEDIUM':   return 'warning.main';
        case 'LOW':      return 'info.main';
        default:         return 'grey.400';
    }
}

// ---------------------------------------------------------------------------
// ScanResultCard
// ---------------------------------------------------------------------------

function ScanResultCard({ result, onRemove }: { result: SCAScanResponse; onRemove: () => void }) {
    const [collapsed, setCollapsed] = useState(false);

    const severityCounts = result.packages
        .flatMap(p => p.vulnerabilities)
        .reduce<Record<string, number>>((acc, v) => { acc[v.severity] = (acc[v.severity] ?? 0) + 1; return acc; }, {});

    return (
        <Paper variant="outlined" sx={{ mb: 2 }}>
            <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, flexWrap: 'wrap',
                cursor: 'pointer', bgcolor: 'action.hover',
                borderRadius: collapsed ? 1 : '4px 4px 0 0',
            }} onClick={() => setCollapsed(c => !c)}>
                <IconButton size="small" onClick={e => { e.stopPropagation(); setCollapsed(c => !c); }}>
                    {collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
                </IconButton>
                <Typography variant="body1" fontWeight={700} sx={{ mr: 'auto' }}>{result.filename}</Typography>
                {!result.scan_error && (
                    <>
                        <Typography variant="body2" color="text.secondary">
                            {result.total_vulnerabilities} vuln{result.total_vulnerabilities !== 1 ? 's' : ''} · {result.packages.length} pkg{result.packages.length !== 1 ? 's' : ''}
                        </Typography>
                        {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const)
                            .filter(s => severityCounts[s])
                            .map(s => <Chip key={s} label={`${s} ${severityCounts[s]}`} color={SEVERITY_COLOR[s]} size="small" sx={{ fontWeight: 700 }} />)}
                    </>
                )}
                {result.scan_error && <Chip label="Error" color="error" size="small" />}
                <Tooltip title="Remove">
                    <IconButton size="small" onClick={e => { e.stopPropagation(); onRemove(); }}>
                        <ClearAllIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
            <Collapse in={!collapsed}>
                <Box sx={{ p: 2 }}>
                    {result.scan_error && <Alert severity="error">{result.scan_error}</Alert>}
                    {!result.scan_error && result.packages.length === 0 && <Alert severity="success">No vulnerabilities detected.</Alert>}
                    {!result.scan_error && result.packages.length > 0 && (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                                        <TableCell sx={{ width: 40 }} />
                                        <TableCell><Typography variant="subtitle2">Package</Typography></TableCell>
                                        <TableCell><Typography variant="subtitle2">Version</Typography></TableCell>
                                        <TableCell><Typography variant="subtitle2">Worst Severity</Typography></TableCell>
                                        <TableCell align="right"><Typography variant="subtitle2">Vulns</Typography></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {result.packages
                                        .slice().sort((a, b) => {
                                            const worst = (pkg: VulnerablePackage) =>
                                                pkg.vulnerabilities.reduce((best, v) => Math.min(best, SEVERITY_ORDER[v.severity] ?? 4), 4);
                                            return worst(a) - worst(b);
                                        })
                                        .map(pkg => <PackageRow key={`${pkg.ecosystem}:${pkg.name}:${pkg.version}`} pkg={pkg} />)}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Box>
            </Collapse>
        </Paper>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SCAAgent() {
    // Tabs state
    const [tab, setTab] = useState(0); // 0 = New Scan, 1 = Saved Reports

    // Scan state
    const [dragging, setDragging]   = useState(false);
    const [scanning, setScanning]   = useState(false);
    const [results, setResults]     = useState<SCAScanResponse[]>([]);
    const fileInputRef              = useRef<HTMLInputElement>(null);

    // Analysis state
    const [appName, setAppName]             = useState('');
    const [analyzing, setAnalyzing]         = useState(false);
    const [analysis, setAnalysis]           = useState<SCAAnalysis | null>(null);
    const [riskLevel, setRiskLevel]         = useState<string>('UNKNOWN');
    const [summary, setSummary]             = useState<string>('');

    // Report state
    const [generatingReport, setGeneratingReport] = useState(false);
    const [savingReport, setSavingReport] = useState(false);

    // History state
    const [savedReports, setSavedReports] = useState<any[]>([]);
    const [loadingReports, setLoadingReports] = useState(false);
    const { user } = useAuth();
    const isViewer = user?.role === 'VIEWER';

    const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' | 'warning' | 'info' } | null>(null);

    // Fetch reports when history tab is selected
    React.useEffect(() => {
        if (tab === 1) fetchSavedReports();
    }, [tab]);

    const fetchSavedReports = async () => {
        setLoadingReports(true);
        try {
            const res = await api.get('/ai-tools/sca-agent/history');
            setSavedReports(res.data);
        } catch (err: any) {
            setSnack({ msg: err?.response?.data?.detail || 'Failed to fetch saved reports.', sev: 'error' });
        } finally {
            setLoadingReports(false);
        }
    };

    const handleSaveReport = async () => {
        if (!analysis || !appName.trim() || results.length === 0) return;
        setSavingReport(true);
        try {
            await api.post('/ai-tools/sca-agent/save', {
                app_name: appName.trim(),
                scan_results: results,
                ai_summary: summary,
                ai_risk_level: riskLevel,
                ai_recommendations: analysis.recommendations,
                ai_findings: analysis.findings,
            });
            setSnack({ msg: 'Report saved successfully!', sev: 'success' });
            setTab(1); // switch to history tab
        } catch (err: any) {
            setSnack({ msg: err?.response?.data?.detail || 'Failed to save report.', sev: 'error' });
        } finally {
            setSavingReport(false);
        }
    };

    const loadReport = async (id: number) => {
        try {
            const res = await api.get(`/ai-tools/sca-agent/history/${id}`);
            const data = res.data;
            setAppName(data.app_name);
            setRiskLevel(data.ai_risk_level);
            setSummary(data.ai_summary);
            setResults(data.scan_results);
            setAnalysis({
                summary: data.ai_summary,
                risk_level: data.ai_risk_level,
                recommendations: data.ai_recommendations,
                findings: data.ai_findings,
            });
            setTab(0); // switch to scan view to display it
            setSnack({ msg: 'Report loaded.', sev: 'success' });
        } catch (err: any) {
            setSnack({ msg: err?.response?.data?.detail || 'Failed to load report.', sev: 'error' });
        }
    };

    const deleteReport = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this report?')) return;
        try {
            await api.delete(`/ai-tools/sca-agent/history/${id}`);
            setSnack({ msg: 'Report deleted.', sev: 'success' });
            fetchSavedReports();
        } catch (err: any) {
            setSnack({ msg: err?.response?.data?.detail || 'Failed to delete report.', sev: 'error' });
        }
    };

    // ---- Scan ----

    const runScan = useCallback(async (files: File[]) => {
        const valid = files.filter(f => {
            if (!isAllowedFile(f.name)) {
                setSnack({ msg: `Skipped "${f.name}" — unsupported type. Accepted: ${ALLOWED_DESCRIPTION}`, sev: 'warning' });
                return false;
            }
            return true;
        });
        if (valid.length === 0) return;

        setScanning(true);
        const form = new FormData();
        valid.forEach(f => form.append('files', f, f.name));

        try {
            const response = await api.post<SCAScanResponse[]>('/ai-tools/sca-agent/scan', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const newResults = response.data;
            setResults(prev => [...prev, ...newResults]);
            // Reset analysis when new files are added
            setAnalysis(null);

            const totalVulns = newResults.reduce((sum, r) => sum + r.total_vulnerabilities, 0);
            const errors = newResults.filter(r => r.scan_error).length;
            if (errors > 0) {
                setSnack({ msg: `${errors} file(s) had scan errors.`, sev: 'error' });
            } else if (totalVulns === 0) {
                setSnack({ msg: `Scanned ${newResults.length} file(s) — no vulnerabilities found.`, sev: 'success' });
            } else {
                setSnack({ msg: `Found ${totalVulns} vulnerabilities across ${newResults.length} file(s).`, sev: 'warning' });
            }
        } catch (err: any) {
            setSnack({ msg: err?.response?.data?.detail || 'Scan failed.', sev: 'error' });
        } finally {
            setScanning(false);
        }
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) runScan(Array.from(e.target.files));
        e.target.value = '';
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files) runScan(Array.from(e.dataTransfer.files));
    };

    const removeResult = (index: number) => {
        setResults(prev => prev.filter((_, i) => i !== index));
        setAnalysis(null);
    };

    // ---- AI Analysis ----

    const handleAnalyze = async () => {
        if (!appName.trim()) {
            setSnack({ msg: 'Please enter an application name before generating analysis.', sev: 'info' });
            return;
        }
        setAnalyzing(true);
        try {
            const response = await api.post<SCAAnalysis>('/ai-tools/sca-agent/analyze', {
                app_name: appName.trim(),
                scan_results: results,
                model_name: getSavedModel(),
            });
            setAnalysis(response.data);
            setRiskLevel(response.data.risk_level);
            setSummary(response.data.summary);
        } catch (err: any) {
            setSnack({ msg: err?.response?.data?.detail || 'AI analysis failed.', sev: 'error' });
        } finally {
            setAnalyzing(false);
        }
    };

    // ---- PDF Report ----

    const handleGenerateReport = async () => {
        setGeneratingReport(true);
        try {
            const response = await api.post('/ai-tools/sca-agent/report', {
                app_name: appName.trim() || 'Unknown Application',
                scan_results: results,
                ai_summary: summary,
                ai_risk_level: riskLevel,
                ai_recommendations: analysis?.recommendations ?? [],
                ai_findings: analysis?.findings ?? [],
            }, { responseType: 'blob' });

            const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `SCA_Report_${(appName || 'report').replace(/\s+/g, '_')}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
            setSnack({ msg: 'Report downloaded.', sev: 'success' });
        } catch (err: any) {
            setSnack({ msg: err?.response?.data?.detail || 'Report generation failed.', sev: 'error' });
        } finally {
            setGeneratingReport(false);
        }
    };

    // ---- Derived ----

    const totalVulns    = results.reduce((sum, r) => sum + r.total_vulnerabilities, 0);
    const globalCounts  = results
        .flatMap(r => r.packages.flatMap(p => p.vulnerabilities))
        .reduce<Record<string, number>>((acc, v) => { acc[v.severity] = (acc[v.severity] ?? 0) + 1; return acc; }, {});
    const hasResults    = results.length > 0;
    const canAnalyze    = hasResults && !scanning;

    return (
        <Layout title="SCA Agent">
        <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                <BugReportIcon color="primary" sx={{ fontSize: 32 }} />
                <Box>
                    <Typography variant="h5" fontWeight={700}>SCA Agent</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Upload dependency manifests or lockfiles to scan for known vulnerabilities via Google OSV-Scanner.
                    </Typography>
                </Box>
            </Box>

            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)}>
                    <Tab label="Analysis & Scan" icon={<BugReportIcon fontSize="small" />} iconPosition="start" />
                    <Tab label="Saved Reports" icon={<HistoryIcon fontSize="small" />} iconPosition="start" />
                </Tabs>
            </Box>

            {tab === 0 && (
                <>
                    {/* Upload Zone */}
            <Paper
                variant="outlined"
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => !scanning && fileInputRef.current?.click()}
                sx={{
                    p: 4, mb: 3, textAlign: 'center', borderStyle: 'dashed', borderWidth: 2,
                    borderColor: dragging ? 'primary.main' : 'divider',
                    bgcolor: dragging ? 'action.hover' : 'background.paper',
                    cursor: scanning ? 'not-allowed' : 'pointer',
                    transition: 'border-color 0.2s, background-color 0.2s',
                }}
            >
                <input type="file" ref={fileInputRef} style={{ display: 'none' }}
                    accept=".xml,.txt,.lock,.json" multiple onChange={handleFileChange} />
                {scanning ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <CircularProgress size={40} />
                        <Typography variant="body1" color="text.secondary">Scanning for vulnerabilities…</Typography>
                    </Box>
                ) : (
                    <Box>
                        <UploadFileIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                        <Typography variant="body1" fontWeight={500}>Drag & drop or click to upload</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            Supported: {ALLOWED_DESCRIPTION}
                        </Typography>
                        <Button variant="outlined" size="small" startIcon={<UploadFileIcon />} sx={{ mt: 2 }}
                            onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                            Choose Files
                        </Button>
                    </Box>
                )}
            </Paper>

            {/* Scan Results */}
            {hasResults && (
                <Box>
                    {results.length > 1 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                            <Typography variant="subtitle1" fontWeight={700}>{results.length} files scanned</Typography>
                            <Divider orientation="vertical" flexItem />
                            <Typography variant="body2" color="text.secondary">{totalVulns} total vulnerabilities</Typography>
                            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const)
                                .filter(s => globalCounts[s])
                                .map(s => <Chip key={s} label={`${s} ${globalCounts[s]}`} color={SEVERITY_COLOR[s]} size="small" sx={{ fontWeight: 700 }} />)}
                            <Box sx={{ ml: 'auto' }}>
                                <Button size="small" startIcon={<ClearAllIcon />}
                                    onClick={() => { setResults([]); setAnalysis(null); }}>
                                    Clear all
                                </Button>
                            </Box>
                        </Box>
                    )}

                    {results.map((result, i) => (
                        <ScanResultCard key={`${result.filename}-${i}`} result={result} onRemove={() => removeResult(i)} />
                    ))}

                    <Divider sx={{ my: 3 }} />

                    {/* Application Details + AI Analysis */}
                    <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Analysis & Report</Typography>

                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap', mb: 2 }}>
                        <TextField
                            label="Application Name"
                            placeholder="e.g. MyApp, Payment Service"
                            value={appName}
                            onChange={e => setAppName(e.target.value)}
                            size="small"
                            sx={{ minWidth: 280, flex: 1 }}
                        />
                        <Button
                            variant="contained"
                            startIcon={analyzing ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
                            onClick={handleAnalyze}
                            disabled={!canAnalyze || analyzing}
                        >
                            {analyzing ? 'Analysing…' : 'Generate AI Analysis'}
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={savingReport ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                            onClick={handleSaveReport}
                            disabled={!analysis || savingReport}
                        >
                            {savingReport ? 'Saving…' : 'Save to Inventory'}
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={generatingReport ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
                            onClick={handleGenerateReport}
                            disabled={!canAnalyze || generatingReport}
                        >
                            {generatingReport ? 'Generating…' : 'Download Report'}
                        </Button>
                    </Box>

                    {/* AI Analysis Result */}
                    {analysis && (
                        <Paper variant="outlined" sx={{ p: 2.5 }}>
                            {/* Risk level header */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                                <AutoAwesomeIcon color="primary" fontSize="small" />
                                <Typography variant="subtitle1" fontWeight={700}>AI Security Analysis</Typography>
                                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                                        Overall Risk:
                                    </Typography>
                                    <Select
                                        value={riskLevel}
                                        onChange={e => setRiskLevel(e.target.value)}
                                        size="small"
                                        sx={{
                                            fontWeight: 700,
                                            fontSize: '0.8rem',
                                            bgcolor: RISK_PALETTE[riskLevel] ?? RISK_PALETTE.UNKNOWN,
                                            color: '#fff',
                                            '.MuiOutlinedInput-notchedOutline': { border: 0 },
                                            '.MuiSvgIcon-root': { color: '#fff' },
                                            '& .MuiSelect-select': { py: '4px', px: '10px' },
                                        }}
                                    >
                                        {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(lvl => (
                                            <MenuItem key={lvl} value={lvl}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: RISK_PALETTE[lvl] }} />
                                                    {lvl}
                                                </Box>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </Box>
                            </Box>

                            {/* Summary — editable */}
                            <TextField
                                label="Executive Summary"
                                value={summary}
                                onChange={e => setSummary(e.target.value)}
                                multiline
                                minRows={3}
                                fullWidth
                                size="small"
                                sx={{ mb: 2.5 }}
                            />

                            {/* Recommendations */}
                            {analysis.recommendations.length > 0 && (
                                <Box sx={{ mb: 2.5 }}>
                                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                                        Recommendations
                                    </Typography>
                                    <Box component="ul" sx={{ m: 0, pl: 3 }}>
                                        {analysis.recommendations.map((rec, i) => (
                                            <Typography key={i} component="li" variant="body2" sx={{ mb: 0.5 }}>
                                                {rec}
                                            </Typography>
                                        ))}
                                    </Box>
                                </Box>
                            )}

                            {/* Triage findings table */}
                            {analysis.findings.length > 0 && (
                                <Box sx={{ mb: 2.5 }}>
                                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                                        Vulnerability Triage ({analysis.findings.length} findings)
                                    </Typography>
                                    <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
                                        <Table size="small" sx={{ minWidth: 800, tableLayout: 'fixed' }}>
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: 'action.hover' }}>
                                                    <TableCell sx={{ width: '20%' }}><Typography variant="subtitle2">Package & Version</Typography></TableCell>
                                                    <TableCell sx={{ width: '15%' }}><Typography variant="subtitle2">Vulnerability ID</Typography></TableCell>
                                                    <TableCell sx={{ width: '15%' }}><Typography variant="subtitle2">Action Required</Typography></TableCell>
                                                    <TableCell sx={{ width: '25%' }}><Typography variant="subtitle2">Why</Typography></TableCell>
                                                    <TableCell sx={{ width: '25%' }}><Typography variant="subtitle2">How to Verify</Typography></TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {analysis.findings
                                                    .slice()
                                                    .sort((a, b) => (ACTION_ORDER[a.action_required] ?? 9) - (ACTION_ORDER[b.action_required] ?? 9))
                                                    .map((f, i) => (
                                                        <TableRow key={i} hover sx={{ '& > td': { verticalAlign: 'top' } }}>
                                                            <TableCell>
                                                                <Typography variant="body2" fontWeight={600} fontFamily="monospace" fontSize="0.78rem" sx={{ wordBreak: 'break-all' }}>
                                                                    {f.package_version}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem" sx={{ wordBreak: 'break-all' }}>
                                                                    {f.vulnerability_id}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Chip
                                                                    label={f.action_required}
                                                                    color={ACTION_COLOR[f.action_required] ?? 'default'}
                                                                    size="small"
                                                                    sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}
                                                                />
                                                            </TableCell>
                                                            <TableCell>
                                                                <Typography variant="body2" fontSize="0.78rem" sx={{ lineHeight: 1.5, wordBreak: 'break-word' }}>
                                                                    {f.why}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Typography variant="body2" fontSize="0.75rem" fontFamily={f.how_to_verify === 'N/A' ? 'inherit' : 'monospace'}
                                                                    color={f.how_to_verify === 'N/A' ? 'text.disabled' : 'text.primary'}
                                                                    sx={{ lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                                                                    {f.how_to_verify}
                                                                </Typography>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </Box>
                            )}

                        </Paper>
                    )}
                </Box>
            )}
        </>
    )}

            {tab === 1 && (
                <Box>
                    <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Saved Reports</Typography>
                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'action.hover' }}>
                                    <TableCell><Typography variant="subtitle2">Application Name</Typography></TableCell>
                                    <TableCell><Typography variant="subtitle2">Risk Level</Typography></TableCell>
                                    <TableCell align="center"><Typography variant="subtitle2">Critical</Typography></TableCell>
                                    <TableCell align="center"><Typography variant="subtitle2">High</Typography></TableCell>
                                    <TableCell><Typography variant="subtitle2">Date Created</Typography></TableCell>
                                    <TableCell align="right"><Typography variant="subtitle2">Actions</Typography></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loadingReports ? (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                                            <CircularProgress size={24} />
                                        </TableCell>
                                    </TableRow>
                                ) : savedReports.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                                            <Typography variant="body2" color="text.secondary">No saved reports found.</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    savedReports.map(report => (
                                        <TableRow key={report.id} hover sx={{ cursor: 'pointer' }} onClick={() => loadReport(report.id)}>
                                            <TableCell><Typography variant="body2" fontWeight={600}>{report.app_name}</Typography></TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={report.risk_level}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: RISK_PALETTE[report.risk_level] ?? RISK_PALETTE.UNKNOWN,
                                                        color: '#fff',
                                                        fontWeight: 700,
                                                        fontSize: '0.75rem'
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell align="center">
                                                {report.critical_count > 0
                                                    ? <Chip label={report.critical_count} size="small" sx={{ bgcolor: '#B71C1C', color: '#fff', fontWeight: 700, fontSize: '0.75rem' }} />
                                                    : <Typography variant="body2" color="text.secondary">—</Typography>}
                                            </TableCell>
                                            <TableCell align="center">
                                                {report.high_count > 0
                                                    ? <Chip label={report.high_count} size="small" sx={{ bgcolor: '#E65100', color: '#fff', fontWeight: 700, fontSize: '0.75rem' }} />
                                                    : <Typography variant="body2" color="text.secondary">—</Typography>}
                                            </TableCell>
                                            <TableCell><Typography variant="body2">{new Date(report.created_at).toLocaleString()}</Typography></TableCell>
                                            <TableCell align="right">
                                                {!isViewer && (
                                                <Tooltip title="Delete Report">
                                                    <IconButton size="small" color="error" onClick={(e) => deleteReport(report.id, e)}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            )}

            <Snackbar open={!!snack} autoHideDuration={5000} onClose={() => setSnack(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                <Alert severity={snack?.sev ?? 'info'} onClose={() => setSnack(null)} variant="filled">
                    {snack?.msg}
                </Alert>
            </Snackbar>
        </Box>
        </Layout>
    );
}
