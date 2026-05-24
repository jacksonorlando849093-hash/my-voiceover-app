import { useState, useEffect } from "react";
import { 
  Cloud, CloudOff, Save, FolderOpen, Trash2, LogOut, RefreshCw, User, Loader2, Link, FileJson, Check 
} from "lucide-react";
import { User as FirebaseUser } from "firebase/auth";
import { googleSignIn, logout, initAuth } from "../utils/firebaseAuth";
import { 
  listDriveFiles, 
  downloadDriveFile, 
  saveDriveFile, 
  deleteDriveFile, 
  DriveFile, 
  ScriptProjectPayload 
} from "../utils/googleDrive";

interface GoogleDriveSyncProps {
  scriptText: string;
  voiceSettings: any;
  lineEmotions: any;
  lineSpeeds: any;
  linePauses: any;
  onLoadScript: (payload: ScriptProjectPayload, fileId: string, fileName: string) => void;
  showToast: (msg: string) => void;
  recordDiscreteAction: () => void;
}

export default function GoogleDriveSync({
  scriptText,
  voiceSettings,
  lineEmotions,
  lineSpeeds,
  linePauses,
  onLoadScript,
  showToast,
  recordDiscreteAction
}: GoogleDriveSyncProps) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  
  // Track open asset context
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showManager, setShowManager] = useState(false);

  // Initialize Auth State on Mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        fetchFilesList(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setDriveFiles([]);
      }
    );
    return () => unsubscribe();
  }, []);

  const fetchFilesList = async (token: string) => {
    setIsLoadingFiles(true);
    try {
      const files = await listDriveFiles(token);
      setDriveFiles(files);
    } catch (err: any) {
      console.error(err);
      showToast("Could not retrieve file inventory from Google Drive.");
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        showToast("Connected to Google Drive successfully!");
        fetchFilesList(result.accessToken);
      }
    } catch (err: any) {
      console.error(err);
      showToast("Access permission or Popup rejected.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setAccessToken(null);
      setDriveFiles([]);
      setActiveFileId(null);
      setActiveFileName(null);
      showToast("Disconnected from Google Drive.");
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleLocalLoadFile = async (file: DriveFile) => {
    if (!accessToken) return;
    setIsLoadingFiles(true);
    try {
      recordDiscreteAction();
      const payload = await downloadDriveFile(accessToken, file.id);
      onLoadScript(payload, file.id, file.name);
      setActiveFileId(file.id);
      setActiveFileName(file.name);
      // Clean up the input string with current loaded name
      const rawName = file.name.endsWith(".json") ? file.name.slice(0, -5) : file.name;
      setNewFileName(rawName);
      showToast(`Loaded "${file.name}" from Drive!`);
    } catch (err: any) {
      console.error(err);
      showToast("Failed to load script payload.");
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleSaveToDrive = async (overwrite: boolean) => {
    if (!accessToken) {
      showToast("Please authenticate with Google first.");
      return;
    }

    const targetPayload: ScriptProjectPayload = {
      scriptText,
      voiceSettings,
      lineEmotions,
      lineSpeeds,
      linePauses,
      savedAt: new Date().toISOString()
    };

    let filename = newFileName.trim();
    if (!filename) {
      filename = activeFileName ? (activeFileName.endsWith(".json") ? activeFileName.slice(0, -5) : activeFileName) : " screenplay_backup";
    }

    // Confirmation trigger for Overwrite/Update state as per guidelines
    if (overwrite && activeFileId && activeFileName) {
      const confirmUpdate = window.confirm(`Are you sure you want to overwrite your existing spreadsheet/script "${activeFileName}" in Google Drive?`);
      if (!confirmUpdate) return;
    }

    setIsSaving(true);
    try {
      recordDiscreteAction();
      const savedFile = await saveDriveFile(
        accessToken,
        filename,
        targetPayload,
        overwrite ? (activeFileId || undefined) : undefined
      );

      setActiveFileId(savedFile.id);
      setActiveFileName(savedFile.name);
      const cleanName = savedFile.name.endsWith(".json") ? savedFile.name.slice(0, -5) : savedFile.name;
      setNewFileName(cleanName);
      
      showToast(overwrite ? "Overwrote existing Drive file!" : "Successfully saved project to Google Drive!");
      await fetchFilesList(accessToken);
    } catch (err: any) {
      console.error(err);
      showToast(`Could not complete save: ${err.message || "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWithConfirm = async (file: DriveFile) => {
    if (!accessToken) return;

    // Strict safety confirmation before destructive Workspace action
    const confirmed = window.confirm(`Warning: Are you sure you want to permanently delete "${file.name}" from Google Drive? This cannot be undone.`);
    if (!confirmed) return;

    try {
      recordDiscreteAction();
      await deleteDriveFile(accessToken, file.id);
      showToast(`Deleted "${file.name}" from Drive.`);
      if (activeFileId === file.id) {
        setActiveFileId(null);
        setActiveFileName(null);
      }
      await fetchFilesList(accessToken);
    } catch (err: any) {
      console.error(err);
      showToast("An error occurred during file deletion.");
    }
  };

  // Filter Drive Files list based on search query
  const filteredFiles = driveFiles.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-[#171717] rounded-[10px] border border-zinc-850 p-5 shadow-lg flex flex-col gap-4 animate-fadeIn">
      {/* Header section with credentials trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-[#00D9FF]/8 flex items-center justify-center">
            <Cloud className="h-5 w-5 text-[#00D9FF]" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-mono uppercase tracking-widest text-[#00D9FF] font-black">Google Drive Sync</span>
            <span className="text-[11px] text-zinc-400">Save and reload your screenplay multi-actor workflows.</span>
          </div>
        </div>

        {/* Integration Credentials Trigger */}
        <div className="flex items-center">
          {user ? (
            <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800/80 p-1.5 pl-3 rounded-full shadow-inner">
              <div className="flex flex-col text-right">
                <span className="text-[11px] font-bold text-white leading-tight">{user.displayName || "Google User"}</span>
                <span className="text-[9px] font-mono text-zinc-500 leading-tight">{user.email}</span>
              </div>
              <button
                onClick={handleLogout}
                title="Disconnect Google"
                className="p-1.5 rounded-full bg-zinc-800 hover:bg-red-500/10 hover:text-red-400 text-zinc-400 transition-colors duration-200 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="px-4 py-2 bg-white text-zinc-900 hover:bg-zinc-100 active:scale-95 text-xs font-bold rounded-lg transition-all duration-250 flex items-center justify-center gap-2 shadow-sm cursor-pointer border border-zinc-300"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-900" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  {/* Styled G Icon */}
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-3.5 w-3.5">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                  <span>Sign in with Google</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {user ? (
        <div className="flex flex-col gap-4">
          {/* Active File Context Alert */}
          {activeFileId && activeFileName && (
            <div className="flex items-center justify-between gap-2.5 bg-[#00D9FF]/5 border border-[#00D9FF]/20 px-3 py-2 rounded-lg text-xs">
              <div className="flex items-center gap-2 text-zinc-300">
                <Link className="h-3.5 w-3.5 text-[#00D9FF]" />
                <span>Active Drive File: <strong className="text-white">{activeFileName}</strong></span>
              </div>
              <button 
                onClick={() => {
                  setActiveFileId(null);
                  setActiveFileName(null);
                  showToast("Cleared Google Drive active file lock.");
                }}
                className="text-[10px] underline text-[#00D9FF] hover:text-white cursor-pointer"
              >
                Clear Link
              </button>
            </div>
          )}

          {/* Form controls to save to Google Drive */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">Save as Screenplay File</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-grow">
                <input
                  type="text"
                  placeholder="screenplay_backup"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  className="w-full bg-[#111111] border border-zinc-850 focus:border-[#00D9FF] text-white text-xs px-3.5 py-2.5 rounded-lg focus:outline-none transition-colors"
                />
                <span className="absolute right-3.5 top-3 text-[10px] font-mono text-zinc-500 select-none">.json</span>
              </div>
              
              <div className="flex gap-2 shrink-0">
                {activeFileId && (
                  <button
                    onClick={() => handleSaveToDrive(true)}
                    disabled={isSaving}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-[#00D9FF]/10 hover:bg-[#00D9FF]/20 text-[#00D9FF] border border-[#00D9FF]/20 rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                    title={`Overwrite current file: ${activeFileName}`}
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    <span>Save (Overwrite)</span>
                  </button>
                )}
                
                <button
                  onClick={() => handleSaveToDrive(false)}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-bold border border-zinc-750 transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isSaving && !activeFileId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 text-zinc-400" />}
                  <span>Save as New</span>
                </button>
              </div>
            </div>
          </div>

          {/* Collapsible toggle for listing Drive workspace files */}
          <div className="border border-zinc-850 bg-zinc-900/40 rounded-lg">
            <button
              onClick={() => setShowManager(!showManager)}
              className="w-full px-4 py-3 flex items-center justify-between text-xs text-zinc-300 hover:text-white hover:bg-zinc-900/80 transition-colors uppercase font-mono tracking-wider font-semibold cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 text-[#00D9FF]" />
                <span>Browse Drive Scripts ({driveFiles.length})</span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">{showManager ? "Collapse ▲" : "Expand ▼"}</span>
            </button>

            {showManager && (
              <div className="border-t border-zinc-850 p-3.5 flex flex-col gap-3">
                {/* Search controller */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search Drive scripts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#111111] border border-zinc-850 focus:border-[#00D9FF] text-white text-xs px-3 py-2 rounded-md focus:outline-none transition-colors"
                  />
                  <button
                    onClick={() => fetchFilesList(accessToken)}
                    disabled={isLoadingFiles}
                    title="Refresh listing"
                    className="p-2 rounded-md bg-zinc-800 hover:bg-zinc-750 text-zinc-400 hover:text-white transition-colors cursor-pointer border border-zinc-750"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingFiles ? "animate-spin" : ""}`} />
                  </button>
                </div>

                {/* List Container */}
                <div className="max-h-[220px] overflow-y-auto pr-1 flex flex-col gap-1.5 scrollbar-thin">
                  {isLoadingFiles ? (
                    <div className="py-6 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs">
                      <Loader2 className="h-5 w-5 animate-spin text-[#00D9FF]" />
                      <span>Reading file inventory...</span>
                    </div>
                  ) : filteredFiles.length === 0 ? (
                    <div className="text-center py-6 text-zinc-550 text-[11px] font-mono">
                      {searchQuery ? "No matching JSON files found." : "No saved multi-actor voiceover JSON files found on your Drive."}
                    </div>
                  ) : (
                    filteredFiles.map((file) => (
                      <div 
                        key={file.id} 
                        className={`flex items-center justify-between gap-3 p-2 rounded-lg border text-xs transition-colors duration-150 ${
                          activeFileId === file.id 
                            ? "bg-[#00D9FF]/5 border-[#00D9FF]/30" 
                            : "bg-[#111111]/60 hover:bg-[#111111] border-zinc-850 hover:border-zinc-800"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <FileJson className={`h-4 w-4 shrink-0 ${activeFileId === file.id ? "text-[#00D9FF]" : "text-zinc-500"}`} />
                          <div className="flex flex-col min-w-0 pr-1">
                            <span className="font-medium text-white truncate break-keep" title={file.name}>{file.name}</span>
                            <span className="text-[9px] text-zinc-500 font-mono leading-none mt-1">
                              Modified: {new Date(file.modifiedTime).toLocaleDateString()} at {new Date(file.modifiedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleLocalLoadFile(file)}
                            className="px-2.5 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-750 text-white font-medium text-[10px] transition-colors cursor-pointer border border-zinc-700/60"
                          >
                            Open
                          </button>
                          <button
                            onClick={() => handleDeleteWithConfirm(file)}
                            title="Delete file"
                            className="p-1.5 rounded-md hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="py-2.5 border border-dashed border-zinc-800 rounded-lg text-center flex flex-col items-center justify-center gap-2 px-4 shadow-inner">
          <CloudOff className="h-6 w-6 text-zinc-650" />
          <p className="text-[11px] text-zinc-400 max-w-[260px] leading-relaxed">
            Connect your personal Google Drive account to publish, access, and back up screenplays directly from cloud storage.
          </p>
        </div>
      )}
    </div>
  );
}
