import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    IconButton,
    MenuItem,
    Paper,
    Snackbar,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SendIcon from '@mui/icons-material/Send';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SaveIcon from '@mui/icons-material/Save';
import Layout from '../components/Layout';
import { api } from '../api/client';
import { AI_MODEL_KEY } from './SettingsPage';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type ScriptType = 'AQL Query' | 'Python (API Script)' | 'YARA Rule' | 'Sigma Rule';

const SCRIPT_TYPES: ScriptType[] = ['AQL Query', 'Python (API Script)', 'YARA Rule', 'Sigma Rule'];

const TIMEFRAMES = ['Last 15 Mins', 'Last 1 Hour', 'Last 24 Hours', 'Last 7 Days', 'Last 30 Days', 'Custom'];

interface SampleScenario {
    name: string;
    goal: string;
    scriptType: ScriptType;
    timeframe: string;
    logSources: string;
}

const SAMPLES: SampleScenario[] = [
    {
        name: 'SSH Brute Force',
        goal: 'Identify successful logins after multiple failed attempts. We want to find cases where a source IP had at least 5 login failures followed by a login success within a 15-minute window.',
        scriptType: 'AQL Query',
        timeframe: 'Last 24 Hours',
        logSources: 'Linux Auth Logs, SSH Daemon',
    },
    {
        name: 'PowerShell Download',
        goal: 'Detect execution of encoded PowerShell commands or commands containing Net.WebClient or DownloadString in process command lines, which indicate potential remote payload execution.',
        scriptType: 'Sigma Rule',
        timeframe: 'Last 24 Hours',
        logSources: 'Windows Security Event ID 4688, Sysmon Event ID 1',
    },
    {
        name: 'QRadar Offense API',
        goal: 'Retrieve all open high-severity offenses from QRadar, fetch the associated source IP addresses, and write them to a local CSV file for analyst triage.',
        scriptType: 'Python (API Script)',
        timeframe: 'Last 7 Days',
        logSources: 'QRadar API Gateway',
    },
    {
        name: 'YARA Cobalt Strike',
        goal: 'Write a YARA rule targeting memory structures of a Cobalt Strike beacon, specifically looking for the string pattern ".key" config offset, common default user agents, and sleep telemetry.',
        scriptType: 'YARA Rule',
        timeframe: 'Custom',
        logSources: 'Endpoint Memory Dump',
    }
];

// Comment prefix used for the editor placeholder / error lines, per format.
const COMMENT_PREFIX: Record<ScriptType, string> = {
    'AQL Query': '--',
    'Python (API Script)': '#',
    'YARA Rule': '//',
    'Sigma Rule': '#',
};

interface ChatMessage {
    role: 'user' | 'agent';
    text: string;
}

const PLACEHOLDER = '-- The generated script will appear here';

const getSavedModel = () => localStorage.getItem(AI_MODEL_KEY) || 'gemini-3.5-flash';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SIEMScriptAgent() {
    // Left pane (inputs)
    const [goal, setGoal] = useState('');
    const [scriptType, setScriptType] = useState<ScriptType>('AQL Query');
    const [timeframe, setTimeframe] = useState('Last 24 Hours');
    const [logSources, setLogSources] = useState('');
    const [iocFile, setIocFile] = useState<File | null>(null);

    // Right pane (output & chat)
    const [generatedCode, setGeneratedCode] = useState<string>(PLACEHOLDER);
    const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');

    // UI state
    const [isGenerating, setIsGenerating] = useState(false);
    const [isRefining, setIsRefining] = useState(false);
    const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' | 'info' | 'warning' } | null>(null);
    const [codeCopied, setCodeCopied] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory]);

    const hasScript = !!generatedCode && generatedCode !== PLACEHOLDER && !generatedCode.startsWith('Generating');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setIocFile(e.target.files[0]);
        }
    };

    const handleLoadSample = (sample: SampleScenario) => {
        setGoal(sample.goal);
        setScriptType(sample.scriptType);
        setTimeframe(sample.timeframe);
        setLogSources(sample.logSources);
        setIocFile(null);
        setSnack({ msg: `Loaded sample scenario: ${sample.name}`, sev: 'info' });
    };

    const handleGenerate = async () => {
        if (!goal.trim()) {
            setSnack({ msg: 'Please provide an investigation goal.', sev: 'warning' });
            return;
        }

        setIsGenerating(true);
        setGeneratedCode('Generating...');
        setChatHistory([]);

        try {
            let iocContent = '';
            if (iocFile) {
                iocContent = await iocFile.text();
            }

            const response = await api.post<{ script: string }>('/ai-tools/siem-agent/generate', {
                goal,
                script_type: scriptType,
                timeframe,
                log_sources: logSources,
                ioc_content: iocContent,
                model_name: getSavedModel(),
            });

            setGeneratedCode(response.data.script);
            setChatHistory([
                { role: 'agent', text: 'Script generated successfully. Ask for any refinements below.' },
            ]);
        } catch (error: any) {
            console.error('Error generating script:', error);
            setGeneratedCode(`${COMMENT_PREFIX[scriptType]} Error occurred during generation.`);
            setSnack({ msg: error?.response?.data?.detail || 'Failed to generate script.', sev: 'error' });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSendChat = async () => {
        if (!chatInput.trim() || !hasScript) return;

        const userMsg = chatInput.trim();
        setChatInput('');
        setChatHistory((prev) => [...prev, { role: 'user', text: userMsg }]);
        setIsRefining(true);

        try {
            const response = await api.post<{ script: string; reply?: string }>('/ai-tools/siem-agent/refine', {
                current_script: generatedCode,
                refinement_request: userMsg,
                script_type: scriptType,
                chat_history: chatHistory.map((c) => ({ role: c.role, content: c.text })),
                model_name: getSavedModel(),
            });

            setGeneratedCode(response.data.script);
            setChatHistory((prev) => [
                ...prev,
                { role: 'agent', text: response.data.reply || 'I have updated the script based on your request.' },
            ]);
        } catch (error: any) {
            console.error('Error refining script:', error);
            setChatHistory((prev) => [
                ...prev,
                { role: 'agent', text: 'Sorry, an error occurred while refining the script.' },
            ]);
        } finally {
            setIsRefining(false);
        }
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(generatedCode);
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
    };

    const EXTENSIONS: Record<ScriptType, string> = {
        'AQL Query': 'txt',
        'Python (API Script)': 'py',
        'YARA Rule': 'yar',
        'Sigma Rule': 'yml',
    };
    const fileExtension = EXTENSIONS[scriptType];
    const cleanScriptType = scriptType.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const editorFilename = `GENERATED_${cleanScriptType}.${fileExtension}`;

    const handleSave = () => {
        if (!hasScript) return;
        const element = document.createElement('a');
        const file = new Blob([generatedCode], { type: 'text/plain;charset=utf-8' });
        element.href = URL.createObjectURL(file);
        element.download = editorFilename;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        setSnack({ msg: 'Script saved successfully.', sev: 'success' });
    };

    return (
        <Layout title="SIEM Script Agent">
            <Box sx={{ maxWidth: 1400, mx: 'auto', height: 'calc(100vh - 132px)', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AutoAwesomeIcon color="primary" /> SIEM Script Agent
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        AI-powered generation of SIEM/SOC detections — AQL queries, Python API scripts, YARA rules,
                        and Sigma rules — from a plain-language goal. Refine interactively via chat.
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 3, flex: 1, minHeight: 0 }}>
                    {/* --- Left pane: input form --- */}
                    <Paper
                        elevation={0}
                        sx={{
                            flex: '0 0 35%',
                            p: 3,
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 2,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 3,
                            overflowY: 'auto',
                        }}
                    >
                        <Typography variant="subtitle1" fontWeight={700} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            Script Configuration
                            <Chip size="small" label="Agent Ready" color="success" variant="outlined" />
                        </Typography>

                        <Box>
                            <Typography variant="caption" fontWeight="bold" sx={{ display: 'block', mb: 1, color: 'text.secondary', textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                                Try a Sample Scenario
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ gap: 1 }}>
                                {SAMPLES.map((s, idx) => (
                                    <Chip
                                        key={idx}
                                        label={s.name}
                                        size="small"
                                        onClick={() => handleLoadSample(s)}
                                        variant="outlined"
                                        color="primary"
                                        sx={{ cursor: 'pointer', borderRadius: 1 }}
                                    />
                                ))}
                            </Stack>
                        </Box>

                        <TextField
                            label="Investigation Goal"
                            placeholder="e.g., Find all failed SSH logins targeting admin accounts in the last 48 hours..."
                            multiline
                            rows={4}
                            fullWidth
                            value={goal}
                            onChange={(e) => setGoal(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                        />

                        <TextField
                            select
                            label="Script Type"
                            value={scriptType}
                            onChange={(e) => setScriptType(e.target.value as ScriptType)}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                        >
                            {SCRIPT_TYPES.map((option) => (
                                <MenuItem key={option} value={option}>
                                    {option}
                                </MenuItem>
                            ))}
                        </TextField>

                        <TextField
                            select
                            label="Timeframe"
                            value={timeframe}
                            onChange={(e) => setTimeframe(e.target.value)}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                        >
                            {TIMEFRAMES.map((option) => (
                                <MenuItem key={option} value={option}>
                                    {option}
                                </MenuItem>
                            ))}
                        </TextField>

                        <TextField
                            label="Log Sources (Optional)"
                            placeholder="e.g., Windows Security, Cisco ASA, Sysmon"
                            fullWidth
                            value={logSources}
                            onChange={(e) => setLogSources(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                        />

                        <Box>
                            <input
                                type="file"
                                accept=".txt,.csv"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleFileChange}
                            />
                            <Button
                                variant="outlined"
                                startIcon={<UploadFileIcon />}
                                onClick={() => fileInputRef.current?.click()}
                                fullWidth
                                sx={{ justifyContent: 'flex-start', py: 1.5, borderColor: 'divider', color: 'text.secondary' }}
                            >
                                {iocFile ? iocFile.name : 'Upload IOCs (.txt, .csv)'}
                            </Button>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, px: 0.5 }}>
                                Attach a file of IPs, hashes, or domains to inject into the detection.
                            </Typography>
                        </Box>

                        <Box sx={{ mt: 'auto', pt: 2 }}>
                            <Button
                                variant="contained"
                                size="large"
                                fullWidth
                                onClick={handleGenerate}
                                disabled={isGenerating || !goal.trim()}
                                startIcon={isGenerating ? <CircularProgress size={20} color="inherit" /> : <AutoAwesomeIcon />}
                                sx={{ py: 1.5 }}
                            >
                                {isGenerating ? 'Generating...' : 'Generate Script'}
                            </Button>
                        </Box>
                    </Paper>

                    {/* --- Right pane: code editor & chat --- */}
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                        {/* Code editor */}
                        <Paper
                            elevation={0}
                            sx={{
                                flex: '1 1 60%',
                                display: 'flex',
                                flexDirection: 'column',
                                bgcolor: '#1e293b',
                                borderRadius: 2,
                                overflow: 'hidden',
                                border: '1px solid',
                                borderColor: 'grey.800',
                            }}
                        >
                            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'grey.800', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="subtitle2" sx={{ color: 'grey.300', fontFamily: 'monospace' }}>
                                    {editorFilename}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Tooltip title={codeCopied ? 'Copied' : 'Copy code'}>
                                        <span>
                                            <Button
                                                size="small"
                                                onClick={handleCopy}
                                                disabled={!hasScript}
                                                startIcon={<ContentCopyIcon fontSize="small" />}
                                                sx={{ color: 'grey.300', textTransform: 'none', '&:hover': { bgcolor: 'grey.800' } }}
                                            >
                                                {codeCopied ? 'Copied' : 'Copy'}
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    <Tooltip title="Save script to file">
                                        <span>
                                            <Button
                                                size="small"
                                                onClick={handleSave}
                                                disabled={!hasScript}
                                                startIcon={<SaveIcon fontSize="small" />}
                                                sx={{ color: 'grey.300', textTransform: 'none', '&:hover': { bgcolor: 'grey.800' } }}
                                            >
                                                Save
                                            </Button>
                                        </span>
                                    </Tooltip>
                                </Box>
                            </Box>

                            <Box
                                sx={{
                                    flex: 1,
                                    p: 2,
                                    overflow: 'auto',
                                    fontFamily: '"Fira Code", "Consolas", monospace',
                                    fontSize: 14,
                                    color: '#e2e8f0',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    lineHeight: 1.6,
                                }}
                            >
                                {generatedCode.split('\n').map((line, i) => (
                                    <div key={i}>{line || ' '}</div>
                                ))}
                            </Box>
                        </Paper>

                        {/* Refinement chat */}
                        <Paper
                            elevation={0}
                            sx={{
                                flex: '0 0 35%',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 2,
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                            }}
                        >
                            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}>
                                <Typography variant="subtitle2" fontWeight="bold">Refinement Chat</Typography>
                            </Box>

                            <Box sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, bgcolor: '#f8fafc' }}>
                                {chatHistory.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary" sx={{ m: 'auto', textAlign: 'center' }}>
                                        Generate a script to start refining via chat.
                                    </Typography>
                                ) : (
                                    chatHistory.map((msg, i) => (
                                        <Box key={i} sx={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                            <Box
                                                sx={{
                                                    maxWidth: '80%',
                                                    p: 1.5,
                                                    borderRadius: 2,
                                                    bgcolor: msg.role === 'user' ? 'primary.main' : 'white',
                                                    color: msg.role === 'user' ? 'white' : 'text.primary',
                                                    border: msg.role === 'agent' ? '1px solid' : 'none',
                                                    borderColor: 'divider',
                                                    boxShadow: msg.role === 'user' ? '0 2px 4px rgba(53,56,205,0.2)' : '0 1px 2px rgba(0,0,0,0.05)',
                                                }}
                                            >
                                                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                                    {msg.role === 'agent' && (
                                                        <AutoAwesomeIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'text-bottom', color: 'primary.main' }} />
                                                    )}
                                                    {msg.text}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    ))
                                )}
                                {isRefining && (
                                    <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                                        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'white', border: '1px solid', borderColor: 'divider' }}>
                                            <CircularProgress size={16} />
                                        </Box>
                                    </Box>
                                )}
                                <div ref={chatEndRef} />
                            </Box>

                            <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'white' }}>
                                <TextField
                                    fullWidth
                                    placeholder="Refine script (e.g., 'exclude management IPs')..."
                                    size="small"
                                    value={chatInput}
                                    disabled={!hasScript || isRefining}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendChat();
                                        }
                                    }}
                                    InputProps={{
                                        endAdornment: (
                                            <IconButton
                                                color="primary"
                                                edge="end"
                                                onClick={handleSendChat}
                                                disabled={!chatInput.trim() || isRefining || !hasScript}
                                            >
                                                <SendIcon />
                                            </IconButton>
                                        ),
                                        sx: { borderRadius: 4, bgcolor: 'grey.50' },
                                    }}
                                />
                            </Box>
                        </Paper>
                    </Box>
                </Box>

                <Snackbar
                    open={!!snack}
                    autoHideDuration={4000}
                    onClose={() => setSnack(null)}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                >
                    <Alert severity={snack?.sev || 'info'} onClose={() => setSnack(null)}>
                        {snack?.msg}
                    </Alert>
                </Snackbar>
            </Box>
        </Layout>
    );
}
