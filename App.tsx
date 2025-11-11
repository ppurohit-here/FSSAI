import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DocumentFile, ChatMessage } from './types';
import { askAboutDocuments } from './services/geminiService';
import { UploadIcon, FileIcon, SendIcon, TrashIcon, BotIcon, UserIcon } from './components/icons';
import * as pdfjsLib from 'pdfjs-dist';

// Set up pdf.js worker to handle PDF processing in the background.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

// Welcome screen component defined outside App to prevent re-renders
const WelcomeScreen: React.FC<{ onSuggestionClick: (suggestion: string) => void }> = ({ onSuggestionClick }) => {
    const suggestions = [
        "Summarize this document.",
        "Generate 3 question-answer pairs from this file.",
        "Explain the main terms used in these documents.",
        "Compare the key points of the uploaded files.",
    ];

    return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <BotIcon className="w-24 h-24 text-brand-accent mb-4" />
            <h1 className="text-4xl font-bold text-brand-text mb-2">Document Q&A Assistant</h1>
            <p className="text-lg text-brand-muted mb-8">Upload one or more documents to get started.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                {suggestions.map(s => (
                    <button
                        key={s}
                        onClick={() => onSuggestionClick(s)}
                        className="bg-brand-surface p-4 rounded-lg text-left hover:bg-brand-subtle transition-colors duration-200"
                    >
                        <p className="font-semibold text-brand-text">{s}</p>
                    </button>
                ))}
            </div>
        </div>
    );
};

// Chat message component defined outside App
const Message: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const isAi = message.sender === 'ai';
    return (
        <div className={`flex items-start gap-4 py-6 ${isAi ? 'bg-brand-surface/50' : ''} px-4 md:px-8`}>
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isAi ? 'bg-brand-accent' : 'bg-brand-subtle'}`}>
                {isAi ? <BotIcon className="w-5 h-5 text-white" /> : <UserIcon className="w-5 h-5 text-brand-text" />}
            </div>
            <div className="flex-1 pt-1">
                <p className="text-brand-text whitespace-pre-wrap">{message.text}</p>
            </div>
        </div>
    );
};


export default function App() {
    const [documents, setDocuments] = useState<DocumentFile[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files) return;

        const newDocs: DocumentFile[] = [];
        const readPromises: Promise<void>[] = [];

        Array.from(files).forEach((file: File) => {
            const promise = new Promise<void>(async (resolve, reject) => {
                try {
                    let content = '';
                    if (file.type === 'application/pdf') {
                        const arrayBuffer = await file.arrayBuffer();
                        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                        let fullText = '';
                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const textContent = await page.getTextContent();
                            // Join text items with a space, and separate pages with a newline
                            const pageText = textContent.items.map(item => ('str' in item ? item.str : '')).join(' ');
                            fullText += pageText + '\n\n';
                        }
                        content = fullText;
                    } else {
                        content = await new Promise((res, rej) => {
                            const reader = new FileReader();
                            reader.onload = (e) => res(e.target?.result as string);
                            reader.onerror = (e) => rej(e);
                            reader.readAsText(file);
                        });
                    }
                    if (content) {
                        newDocs.push({ name: file.name, content });
                    }
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
            readPromises.push(promise);
        });

        Promise.all(readPromises).then(() => {
            setDocuments(prevDocs => [...prevDocs, ...newDocs]);
        }).catch(err => {
            console.error("Error reading files:", err);
            setError("There was an error reading one or more files. Please ensure they are valid text or PDF files.");
        });
        
        event.target.value = '';
    };

    const removeDocument = (docName: string) => {
        setDocuments(docs => docs.filter(doc => doc.name !== docName));
    };

    const handleSubmit = useCallback(async (query: string) => {
        if (!query.trim() || isLoading) return;
        if (documents.length === 0) {
            setError("Please upload at least one document before asking a question.");
            return;
        }

        setError(null);
        const newUserMessage: ChatMessage = { id: Date.now().toString(), sender: 'user', text: query };
        setMessages(prev => [...prev, newUserMessage]);
        setIsLoading(true);

        try {
            const aiResponseText = await askAboutDocuments(query, documents);
            const newAiMessage: ChatMessage = { id: (Date.now() + 1).toString(), sender: 'ai', text: aiResponseText };
            setMessages(prev => [...prev, newAiMessage]);
        } catch (e) {
            if (e instanceof Error) {
                setError(e.message);
            } else {
                setError("An unknown error occurred.");
            }
        } finally {
            setIsLoading(false);
            setUserInput('');
        }
    }, [isLoading, documents]);

    const handleSuggestionClick = (suggestion: string) => {
        if (documents.length === 0) {
            setError("Please upload a document first.");
            return;
        }
        setUserInput(suggestion);
    };

    return (
        <div className="flex h-screen font-sans">
            {/* Sidebar */}
            <aside className="w-80 bg-brand-surface flex flex-col p-4 border-r border-brand-subtle hidden md:flex">
                <h2 className="text-xl font-bold mb-4">Documents</h2>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full bg-brand-accent text-white py-2 px-4 rounded-md flex items-center justify-center gap-2 hover:bg-opacity-80 transition-colors duration-200"
                >
                    <UploadIcon className="w-5 h-5" />
                    Upload Files
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    multiple
                    accept=".txt,.md,.json,.csv,.pdf"
                />
                <div className="mt-4 flex-1 overflow-y-auto space-y-2 pr-2">
                    {documents.map(doc => (
                        <div key={doc.name} className="flex items-center justify-between bg-brand-subtle p-2 rounded-md group">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <FileIcon className="w-5 h-5 flex-shrink-0 text-brand-muted" />
                                <span className="truncate text-sm" title={doc.name}>{doc.name}</span>
                            </div>
                            <button onClick={() => removeDocument(doc.name)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <TrashIcon className="w-5 h-5 text-brand-muted hover:text-red-400" />
                            </button>
                        </div>
                    ))}
                    {documents.length === 0 && (
                        <div className="text-center text-brand-muted text-sm pt-4">No documents uploaded.</div>
                    )}
                </div>
            </aside>

            {/* Main Chat Area */}
            <main className="flex-1 flex flex-col bg-brand-bg">
                <div className="flex-1 overflow-y-auto">
                    {messages.length === 0 ? (
                        <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
                    ) : (
                        <div>
                            {messages.map(msg => <Message key={msg.id} message={msg} />)}
                            {isLoading && (
                                <div className="flex items-start gap-4 py-6 px-4 md:px-8">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-brand-accent">
                                        <BotIcon className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="flex items-center gap-2 pt-2">
                                        <span className="w-2 h-2 bg-brand-muted rounded-full animate-pulse delay-0"></span>
                                        <span className="w-2 h-2 bg-brand-muted rounded-full animate-pulse delay-150"></span>
                                        <span className="w-2 h-2 bg-brand-muted rounded-full animate-pulse delay-300"></span>
                                    </div>
                                </div>
                            )}
                             <div ref={chatEndRef} />
                        </div>
                    )}
                </div>

                {/* Chat Input */}
                <div className="p-4 md:p-6 border-t border-brand-subtle">
                     {error && (
                        <div className="bg-red-500/20 text-red-300 p-2 rounded-md text-sm mb-4 text-center">
                            {error}
                        </div>
                    )}
                    <div className="relative">
                        <textarea
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit(userInput);
                                }
                            }}
                            placeholder={documents.length > 0 ? "Ask a question about your documents..." : "Upload a document to start chatting"}
                            className="w-full bg-brand-surface rounded-lg p-4 pr-12 resize-none border border-brand-subtle focus:ring-2 focus:ring-brand-accent focus:outline-none"
                            rows={1}
                            disabled={isLoading || documents.length === 0}
                        />
                        <button
                            onClick={() => handleSubmit(userInput)}
                            disabled={!userInput.trim() || isLoading || documents.length === 0}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-brand-accent disabled:bg-brand-muted disabled:cursor-not-allowed hover:bg-opacity-80 transition-colors"
                        >
                            <SendIcon className="w-5 h-5 text-white" />
                        </button>
                    </div>
                    {/* Upload button for mobile */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-2 w-full bg-brand-subtle text-white py-2 px-4 rounded-md flex items-center justify-center gap-2 hover:bg-opacity-80 transition-colors duration-200 md:hidden"
                    >
                        <UploadIcon className="w-5 h-5" />
                        Upload Files
                    </button>
                </div>
            </main>
        </div>
    );
}