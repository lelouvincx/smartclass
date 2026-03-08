import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, FileText, Upload, Clock, CheckCircle, Plus, Trash2, LogOut, FileUp } from 'lucide-react';

// ==========================================
// SHADCN/UI INLINE PRIMITIVES
// ==========================================

const Button = React.forwardRef(({ className = '', variant = "default", size = "default", ...props }, ref) => {
  const variants = {
    default: "bg-slate-900 text-slate-50 hover:bg-slate-900/90 shadow",
    destructive: "bg-red-500 text-slate-50 hover:bg-red-500/90 shadow-sm",
    outline: "border border-slate-200 bg-white shadow-sm hover:bg-slate-100 hover:text-slate-900",
    secondary: "bg-slate-100 text-slate-900 hover:bg-slate-100/80",
    ghost: "hover:bg-slate-100 hover:text-slate-900",
    link: "text-slate-900 underline-offset-4 hover:underline",
  };
  const sizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 rounded-md px-3 text-xs",
    lg: "h-10 rounded-md px-8",
    icon: "h-9 w-9",
  };
  const base = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50";
  return <button ref={ref} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
});

const Input = React.forwardRef(({ className = '', type, ...props }, ref) => (
  <input
    type={type}
    className={`flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    ref={ref}
    {...props}
  />
));

const Label = React.forwardRef(({ className = '', ...props }, ref) => (
  <label ref={ref} className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`} {...props} />
));

const Badge = ({ className = '', variant = "default", ...props }) => {
  const variants = {
    default: "border-transparent bg-slate-900 text-slate-50 shadow hover:bg-slate-900/80",
    secondary: "border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100/80",
    destructive: "border-transparent bg-red-500 text-slate-50 shadow hover:bg-red-500/80",
    outline: "text-slate-950",
  };
  return <div className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 ${variants[variant]} ${className}`} {...props} />;
};

const Card = React.forwardRef(({ className = '', ...props }, ref) => (
  <div ref={ref} className={`rounded-xl border border-slate-200 bg-white text-slate-950 shadow ${className}`} {...props} />
));
const CardHeader = React.forwardRef(({ className = '', ...props }, ref) => (
  <div ref={ref} className={`flex flex-col space-y-1.5 p-6 ${className}`} {...props} />
));
const CardTitle = React.forwardRef(({ className = '', ...props }, ref) => (
  <h3 ref={ref} className={`font-semibold leading-none tracking-tight ${className}`} {...props} />
));
const CardDescription = React.forwardRef(({ className = '', ...props }, ref) => (
  <p ref={ref} className={`text-sm text-slate-500 ${className}`} {...props} />
));
const CardContent = React.forwardRef(({ className = '', ...props }, ref) => (
  <div ref={ref} className={`p-6 pt-0 ${className}`} {...props} />
));
const CardFooter = React.forwardRef(({ className = '', ...props }, ref) => (
  <div ref={ref} className={`flex items-center p-6 pt-0 ${className}`} {...props} />
));

const Table = React.forwardRef(({ className = '', ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table ref={ref} className={`w-full caption-bottom text-sm ${className}`} {...props} />
  </div>
));
const TableHeader = React.forwardRef(({ className = '', ...props }, ref) => (
  <thead ref={ref} className={`[&_tr]:border-b ${className}`} {...props} />
));
const TableBody = React.forwardRef(({ className = '', ...props }, ref) => (
  <tbody ref={ref} className={`[&_tr:last-child]:border-0 ${className}`} {...props} />
));
const TableRow = React.forwardRef(({ className = '', ...props }, ref) => (
  <tr ref={ref} className={`border-b border-slate-200 transition-colors hover:bg-slate-100/50 data-[state=selected]:bg-slate-100 ${className}`} {...props} />
));
const TableHead = React.forwardRef(({ className = '', ...props }, ref) => (
  <th ref={ref} className={`h-10 px-4 text-left align-middle font-medium text-slate-500 [&:has([role=checkbox])]:pr-0 ${className}`} {...props} />
));
const TableCell = React.forwardRef(({ className = '', ...props }, ref) => (
  <td ref={ref} className={`p-4 align-middle [&:has([role=checkbox])]:pr-0 ${className}`} {...props} />
));

const NativeSelect = React.forwardRef(({ className = '', ...props }, ref) => (
  <select
    ref={ref}
    className={`flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    {...props}
  />
));

// --- MOCK DATA ---
const INITIAL_ASSIGNMENTS = [
  {
    id: 'assign_1',
    title: 'PostgreSQL 101: Joins & Aggregations',
    durationMinutes: 45,
    pdfUrl: 'mock_postgres_101.pdf',
    schema: [
      { q_id: 1, type: 'mcq', answer: 'B' },
      { q_id: 2, type: 'boolean', answer: 'True' },
      { q_id: 3, type: 'numeric', answer: '100' },
    ],
  },
];

export default function App() {
  const [role, setRole] = useState(null);
  const [assignments, setAssignments] = useState(INITIAL_ASSIGNMENTS);

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center pb-8">
            <CardTitle className="text-2xl font-bold">Assessment Platform</CardTitle>
            <CardDescription>Select your role to access the system.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={() => setRole('teacher')} className="w-full h-12 text-base flex gap-3">
              <CheckCircle size={20} /> Login as Teacher
            </Button>
            <Button variant="outline" onClick={() => setRole('student')} className="w-full h-12 text-base flex gap-3">
              <FileText size={20} /> Login as Student
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-950">
      <header className="bg-white border-b border-slate-200 px-6 h-14 flex justify-between items-center sticky top-0 z-40">
        <h1 className="font-semibold">
          {role === 'teacher' ? 'Teacher Portal' : 'Student Portal'}
        </h1>
        <Button variant="ghost" size="sm" onClick={() => setRole(null)} className="flex gap-2 text-slate-500">
          <LogOut size={16} /> Switch Role
        </Button>
      </header>

      <main className="p-6 md:p-8">
        {role === 'teacher' ? (
          <TeacherDashboard assignments={assignments} setAssignments={setAssignments} />
        ) : (
          <StudentDashboard assignments={assignments} />
        )}
      </main>
    </div>
  );
}

// ==========================================
// TEACHER PORTAL
// ==========================================
function TeacherDashboard({ assignments, setAssignments }) {
  const [isCreating, setIsCreating] = useState(false);

  if (isCreating) {
    return (
      <AssignmentBuilder
        onSave={(newAssignment) => {
          setAssignments([...assignments, newAssignment]);
          setIsCreating(false);
        }}
        onCancel={() => setIsCreating(false)}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Active Assignments</h2>
          <p className="text-slate-500 text-sm">Manage your schemas and document distribution.</p>
        </div>
        <Button onClick={() => setIsCreating(true)} className="flex items-center gap-2">
          <Plus size={16} /> Create New
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[400px]">Title</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Questions</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.title}</TableCell>
                <TableCell>{a.durationMinutes} mins</TableCell>
                <TableCell>{a.schema.length}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                    Active
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function AssignmentBuilder({ onSave, onCancel }) {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(60);
  const [schema, setSchema] = useState([{ q_id: 1, type: 'mcq', answer: 'A' }]);

  const addQuestion = () => {
    const nextId = schema.length > 0 ? Math.max(...schema.map((q) => q.q_id)) + 1 : 1;
    setSchema([...schema, { q_id: nextId, type: 'mcq', answer: 'A' }]);
  };

  const updateQuestion = (id, field, value) => {
    setSchema(schema.map((q) => (q.q_id === id ? { ...q, [field]: value } : q)));
  };

  const removeQuestion = (id) => {
    setSchema(schema.filter((q) => q.q_id !== id));
  };

  const handleSave = () => {
    if (!title) return;
    onSave({
      id: `assign_${Date.now()}`,
      title,
      durationMinutes: duration,
      pdfUrl: 'uploaded_document.pdf',
      schema,
    });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Build Assignment Schema</CardTitle>
          <CardDescription>Configure execution parameters and the standardized answer key.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="title">Assignment Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Week 1 Quiz" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (Minutes)</Label>
              <Input id="duration" type="number" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 0)} />
            </div>
          </div>

          <div className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer">
            <FileUp className="mx-auto text-slate-400 mb-3" size={32} />
            <p className="text-sm font-medium text-slate-900">Drag & Drop PDF Exercise</p>
            <p className="text-xs text-slate-500 mt-1">Students will view this alongside the input form.</p>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label className="text-base">Answer Key Schema</Label>
              <Button variant="outline" size="sm" onClick={addQuestion}>
                <Plus size={14} className="mr-1" /> Add Question
              </Button>
            </div>

            <div className="space-y-3">
              {schema.map((q, index) => (
                <div key={q.q_id} className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                  <Badge variant="secondary" className="w-10 justify-center">
                    Q{index + 1}
                  </Badge>

                  <NativeSelect value={q.type} onChange={(e) => updateQuestion(q.q_id, 'type', e.target.value)} className="w-40">
                    <option value="mcq">Multiple Choice</option>
                    <option value="boolean">True / False</option>
                    <option value="numeric">Numeric Fill-in</option>
                  </NativeSelect>

                  {q.type === 'mcq' && (
                    <NativeSelect value={q.answer} onChange={(e) => updateQuestion(q.q_id, 'answer', e.target.value)} className="flex-1">
                      {['A', 'B', 'C', 'D'].map((opt) => (
                        <option key={opt} value={opt}>
                          Option {opt}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                  {q.type === 'boolean' && (
                    <NativeSelect value={q.answer} onChange={(e) => updateQuestion(q.q_id, 'answer', e.target.value)} className="flex-1">
                      <option value="True">True</option>
                      <option value="False">False</option>
                    </NativeSelect>
                  )}
                  {q.type === 'numeric' && (
                    <Input type="number" value={q.answer} onChange={(e) => updateQuestion(q.q_id, 'answer', e.target.value)} className="flex-1" placeholder="Exact value" />
                  )}

                  <Button variant="ghost" size="icon" onClick={() => removeQuestion(q.q_id)} className="text-slate-500 hover:text-red-600">
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/50 py-4">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Schema</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// ==========================================
// STUDENT PORTAL
// ==========================================
function StudentDashboard({ assignments }) {
  const [activeTask, setActiveTask] = useState(null);

  if (activeTask) {
    return <ExecutionEngine assignment={activeTask} onComplete={() => setActiveTask(null)} />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Pending Assignments</h2>
        <p className="text-slate-500 text-sm">Select a task to enter the execution environment.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {assignments.map((a) => (
          <Card key={a.id} className="flex flex-col hover:shadow-md transition-shadow">
            <CardHeader className="pb-4">
              <div className="flex justify-between items-start mb-2">
                <div className="bg-slate-100 p-2.5 rounded-lg text-slate-700">
                  <FileText size={20} />
                </div>
                <Badge variant="outline" className="flex gap-1 items-center bg-white">
                  <Clock size={12} /> {a.durationMinutes}m
                </Badge>
              </div>
              <CardTitle className="text-lg">{a.title}</CardTitle>
              <CardDescription>{a.schema.length} standardized questions</CardDescription>
            </CardHeader>
            <div className="flex-1"></div>
            <CardFooter className="pt-0">
              <Button onClick={() => setActiveTask(a)} className="w-full">
                Start Execution
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ExecutionEngine({ assignment, onComplete }) {
  const [timeLeft, setTimeLeft] = useState(assignment.durationMinutes * 60);
  const [answers, setAnswers] = useState({});
  const [inputMode, setInputMode] = useState('form');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const handleSubmit = useCallback(() => {
    setIsSubmitting(true);
    const payload = assignment.schema.map((q) => ({
      q_id: q.q_id,
      submitted_answer: answersRef.current[q.q_id] || null,
    }));

    console.log('Submitting structured payload to backend:', JSON.stringify(payload, null, 2));

    setTimeout(() => {
      alert('Submission successful. Automated grading complete.');
      onComplete();
    }, 1000);
  }, [assignment.schema, onComplete]);

  useEffect(() => {
    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, handleSubmit]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleAnswerChange = (q_id, val) => {
    setAnswers((prev) => ({ ...prev, [q_id]: val }));
  };

  const simulateOCRScan = () => {
    alert('Simulating OCR capture… In production, this maps standard grid coordinates to the JSON schema.');
    const mockOcrPayload = {};
    assignment.schema.forEach((q) => {
      mockOcrPayload[q.q_id] = q.type === 'mcq' ? 'C' : q.type === 'boolean' ? 'True' : '42';
    });
    setAnswers(mockOcrPayload);
    setInputMode('form');
  };

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col font-sans">
      {/* Execution Header */}
      <div className="bg-slate-950 text-slate-300 px-6 h-14 flex justify-between items-center border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="font-medium text-sm tracking-wide">System Locked: {assignment.title}</span>
        </div>
        <div className={`font-mono text-xl font-bold tracking-wider ${timeLeft < 300 ? 'text-red-400' : 'text-slate-50'}`}>{formatTime(timeLeft)}</div>
      </div>

      {/* Split Pane Environment */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Static PDF Context */}
        <div className="w-1/2 bg-slate-900 border-r border-slate-800 flex flex-col p-4 shrink-0">
          <div className="flex-1 bg-slate-200/5 rounded-xl border border-slate-800 overflow-hidden flex flex-col">
            <div className="bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 shrink-0">
              Document Viewer (Read-Only)
            </div>
            <div className="flex-1 p-8 overflow-y-auto">
              <div className="bg-white max-w-2xl mx-auto min-h-full p-12 shadow-2xl text-slate-900 font-serif rounded-sm">
                <h1 className="text-3xl font-bold mb-8 border-b border-slate-200 pb-4">{assignment.title}</h1>
                <div className="space-y-8">
                  {assignment.schema.map((q, i) => (
                    <div key={q.q_id} className="text-base leading-relaxed">
                      <p className="font-bold mb-3">
                        {i + 1}. Sample Question Text for schema ID {q.q_id}?
                      </p>
                      {q.type === 'mcq' && (
                        <p className="ml-5 text-slate-700 space-y-1">
                          <span className="block">A) Option 1</span>
                          <span className="block">B) Option 2</span>
                          <span className="block">C) Option 3</span>
                          <span className="block">D) Option 4</span>
                        </p>
                      )}
                      {q.type === 'boolean' && <p className="ml-5 text-slate-700">True or False?</p>}
                      {q.type === 'numeric' && <p className="ml-5 text-slate-700">Calculate the value: ________</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Pane: Dynamic Input Capture */}
        <div className="w-1/2 bg-slate-50 flex flex-col shrink-0">
          <div className="bg-white px-6 h-14 border-b border-slate-200 flex justify-between items-center shadow-sm z-10 shrink-0">
            <h2 className="text-sm font-semibold text-slate-800">Data Capture</h2>
            <div className="flex bg-slate-100 p-1 rounded-md">
              <button
                onClick={() => setInputMode('form')}
                className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-all ${inputMode === 'form' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
              >
                Manual Form
              </button>
              <button
                onClick={() => setInputMode('scanner')}
                className={`px-3 py-1.5 text-xs font-medium rounded-sm flex items-center gap-1.5 transition-all ${inputMode === 'scanner' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}
              >
                <Camera size={14} /> Scanner Mode
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8">
            {inputMode === 'form' ? (
              <div className="max-w-md mx-auto space-y-6">
                {assignment.schema.map((q, i) => (
                  <Card key={q.q_id} className="overflow-hidden">
                    <div className="bg-slate-50/50 px-5 py-3 border-b border-slate-100">
                      <p className="font-semibold text-slate-900 text-sm">Question {i + 1}</p>
                    </div>
                    <CardContent className="p-5">
                      {q.type === 'mcq' && (
                        <div className="grid grid-cols-2 gap-3">
                          {['A', 'B', 'C', 'D'].map((opt) => (
                            <label
                              key={opt}
                              className={`flex items-center gap-3 p-3 border rounded-md cursor-pointer transition-all ${
                                answers[q.q_id] === opt
                                  ? 'bg-slate-900 border-slate-900 text-slate-50 font-medium shadow-md'
                                  : 'hover:bg-slate-50 border-slate-200 text-slate-600'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`q_${q.q_id}`}
                                value={opt}
                                checked={answers[q.q_id] === opt}
                                onChange={(e) => handleAnswerChange(q.q_id, e.target.value)}
                                className="hidden"
                              />
                              <div
                                className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                  answers[q.q_id] === opt ? 'border-slate-50' : 'border-slate-300'
                                }`}
                              >
                                {answers[q.q_id] === opt && <div className="w-1.5 h-1.5 bg-slate-50 rounded-full"></div>}
                              </div>
                              {opt}
                            </label>
                          ))}
                        </div>
                      )}

                      {q.type === 'boolean' && (
                        <div className="grid grid-cols-2 gap-3">
                          {['True', 'False'].map((opt) => (
                            <label
                              key={opt}
                              className={`flex items-center justify-center py-2.5 border rounded-md cursor-pointer transition-all ${
                                answers[q.q_id] === opt
                                  ? 'bg-slate-900 border-slate-900 text-slate-50 font-medium shadow-md'
                                  : 'hover:bg-slate-50 border-slate-200 text-slate-600'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`q_${q.q_id}`}
                                value={opt}
                                checked={answers[q.q_id] === opt}
                                onChange={(e) => handleAnswerChange(q.q_id, e.target.value)}
                                className="hidden"
                              />
                              {opt}
                            </label>
                          ))}
                        </div>
                      )}

                      {q.type === 'numeric' && (
                        <Input
                          type="number"
                          value={answers[q.q_id] || ''}
                          onChange={(e) => handleAnswerChange(q.q_id, e.target.value)}
                          placeholder="Enter numerical value..."
                          className="h-11"
                        />
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto">
                <div className="w-full aspect-[3/4] bg-slate-900 rounded-xl relative overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center ring-4 ring-slate-200 ring-offset-4">
                  <div className="absolute inset-4 border border-emerald-500/30 rounded-lg pointer-events-none">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-emerald-500 -mt-px -ml-px"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-emerald-500 -mt-px -mr-px"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-emerald-500 -mb-px -ml-px"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-emerald-500 -mb-px -mr-px"></div>
                  </div>
                  <div className="flex flex-col items-center text-slate-400">
                    <Camera size={48} className="mb-4 opacity-50" />
                    <p className="text-sm font-medium text-slate-300">WebRTC Camera Feed Active</p>
                    <p className="text-xs mt-2 opacity-70">Align standardized answer sheet within grid</p>
                  </div>
                </div>
                <Button onClick={simulateOCRScan} size="lg" className="mt-8 rounded-full px-8 shadow-xl">
                  <Upload size={18} className="mr-2" /> Capture & Process
                </Button>
              </div>
            )}
          </div>

          <div className="bg-white border-t border-slate-200 p-4 flex justify-end shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <Button size="lg" onClick={handleSubmit} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto">
              {isSubmitting ? 'Processing...' : 'Submit Answers'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
