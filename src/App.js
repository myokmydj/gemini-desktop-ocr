// File: src\App.js

// ▼▼▼ [수정] useCallback 훅을 import 합니다.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import './App.css';

const API_KEY_STORAGE_KEY = 'gemini-api-key';
const FONT_STORAGE_KEY = 'gemini-ocr-font';
const GLOSSARY_STORAGE_KEY = 'gemini-ocr-glossary';

const WEB_FONTS = [
  { name: '페이퍼로지', value: "'Paperozi', sans-serif" },
  { name: '프리젠테이션', value: "'Presentation', sans-serif" },
  { name: '시스템 기본', value: "sans-serif" },
];

const getInitialState = (key, defaultValue) => {
  try {
    const savedItem = localStorage.getItem(key);
    return savedItem ? JSON.parse(savedItem) : defaultValue;
  } catch (error) {
    console.error(`Error reading localStorage key “${key}”:`, error);
    return defaultValue;
  }
};

function App() {
  const [apiKey, setApiKey] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('Korean');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [availableFonts, setAvailableFonts] = useState({ web: WEB_FONTS, system: [] });
  const [selectedFont, setSelectedFont] = useState(() => getInitialState(FONT_STORAGE_KEY, WEB_FONTS[0].value));

  const [glossary, setGlossary] = useState(() => getInitialState(GLOSSARY_STORAGE_KEY, []));
  const [newGlossaryOriginal, setNewGlossaryOriginal] = useState('');
  const [newGlossaryTranslated, setNewGlossaryTranslated] = useState('');

  const canvasRef = useRef(null);
  const apiKeyRef = useRef(apiKey);
  const glossaryRef = useRef(glossary);

  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);
  
  useEffect(() => {
    glossaryRef.current = glossary;
  }, [glossary]);


  useEffect(() => {
    const storedEncodedKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (storedEncodedKey) {
      try {
        const decodedKey = atob(storedEncodedKey);
        setApiKey(decodedKey);
      } catch (e) {
        console.error("Failed to decode API key from storage.", e);
        localStorage.removeItem(API_KEY_STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    try {
      if (apiKey) {
        localStorage.setItem(API_KEY_STORAGE_KEY, btoa(apiKey));
      } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
      }
    } catch (e) {
      console.error("Failed to save API key to storage.", e);
    }
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem(GLOSSARY_STORAGE_KEY, JSON.stringify(glossary));
  }, [glossary]);

  useEffect(() => {
    const loadSystemFonts = async () => {
      if (window.electronAPI && typeof window.electronAPI.getSystemFonts === 'function') {
        try {
          const systemFonts = await window.electronAPI.getSystemFonts();
          setAvailableFonts(prev => ({ ...prev, system: systemFonts }));
        } catch (error) {
          console.error('Failed to load system fonts:', error);
        }
      }
    };
    loadSystemFonts();
  }, []);

  useEffect(() => {
    localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify(selectedFont));
    document.documentElement.style.setProperty('--global-font-family', selectedFont);
  }, [selectedFont]);

  const handleStartCapture = () => {
    if (window.electronAPI) {
      setOriginalText('');
      setTranslatedText('');
      setError('');
      window.electronAPI.send('start-capture');
    } else {
      setError("This feature is only available in the Electron app.");
    }
  };
  
  const applyGlossary = (text, currentGlossary) => {
    let processedText = text;
    const sortedGlossary = [...currentGlossary].sort((a, b) => b.original.length - a.original.length);
    
    sortedGlossary.forEach(term => {
      processedText = processedText.replaceAll(term.original, term.translated);
    });
    return processedText;
  };

  // ▼▼▼ [수정] processAndTranslate 함수를 useCallback으로 감싸줍니다.
  // 이 함수는 targetLanguage가 바뀔 때만 새로 생성됩니다.
  const processAndTranslate = useCallback((dataUrl, selection) => {
    if (!apiKeyRef.current) {
      setError('Please enter your Gemini API Key.');
      return;
    }

    setLoading(true);
    setError('');
    setOriginalText('');
    setTranslatedText('');

    const img = new Image();
    img.onload = async () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = selection.width;
      canvas.height = selection.height;
      ctx.drawImage(img, selection.x, selection.y, selection.width, selection.height, 0, 0, selection.width, selection.height);
      const croppedImageBase64 = canvas.toDataURL('image/png').split(',')[1];

      if (!croppedImageBase64) {
        setError('Failed to crop the selected region.');
        setLoading(false);
        return;
      }

      try {
        const ai = new GoogleGenAI({ apiKey: apiKeyRef.current });
        const model = "gemini-2.5-flash";
        const imagePart = { inlineData: { data: croppedImageBase64, mimeType: 'image/png' } };
        const safetySettings = [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ];

        const ocrPrompt = "Extract all text from this image. Only provide the extracted text, without any additional comments or formatting.";
        const ocrResponse = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [imagePart, { text: ocrPrompt }] }],
          config: { safetySettings, thinkingBudget: 0 },
        });

        const extractedText = ocrResponse.text;
        if (!extractedText || extractedText.trim() === '') {
          throw new Error("No text could be extracted from the image.");
        }
        
        setOriginalText(extractedText);

        const textWithGlossary = applyGlossary(extractedText, glossaryRef.current);

        const translatePrompt = `Translate the following text to ${targetLanguage}. Provide only the translated text.\n\nText:\n"""${textWithGlossary}"""`;
        const translateResponse = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: translatePrompt }] }],
          config: { safetySettings, thinkingBudget: 0 },
        });
        setTranslatedText(translateResponse.text);

      } catch (err) {
        console.error(err);
        setError(`An error occurred: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    
    img.onerror = () => {
        setError("Failed to load screenshot data.");
        setLoading(false);
    }
    img.src = dataUrl;
  }, [targetLanguage]); // 의존성 배열에 targetLanguage를 추가합니다.

  // ▼▼▼ [수정] 문제가 되었던 useEffect 훅입니다.
  useEffect(() => {
    if (window.electronAPI) {
      const handleCaptureComplete = (screenshotDataUrl, rect) => {
        if (screenshotDataUrl && rect && rect.width > 0 && rect.height > 0) {
          processAndTranslate(screenshotDataUrl, rect);
        }
      };
      
      const cleanupListener = window.electronAPI.on('capture-complete', handleCaptureComplete);

      return () => {
        cleanupListener();
      };
    }
    // ▼▼▼ [수정] 의존성 배열에 processAndTranslate를 추가하여 ESLint 경고를 해결합니다.
  }, [processAndTranslate]);
  
  const handleAddGlossaryTerm = () => {
    if (newGlossaryOriginal.trim() && newGlossaryTranslated.trim()) {
      setGlossary([
        ...glossary,
        {
          id: Date.now(),
          original: newGlossaryOriginal.trim(),
          translated: newGlossaryTranslated.trim()
        }
      ]);
      setNewGlossaryOriginal('');
      setNewGlossaryTranslated('');
    }
  };

  const handleDeleteGlossaryTerm = (idToDelete) => {
    setGlossary(glossary.filter(term => term.id !== idToDelete));
  };


  return (
    <div className="App">
      <h1>OCR TRANSLATOR</h1>

      <div className="controls-panel">
        <div className="control-group">
          <label htmlFor="api-key">Gemini API Key</label>
          <input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter and save your key..."
          />
        </div>
        
        <div className="control-group">
          <label htmlFor="font-select">Font</label>
          <select id="font-select" value={selectedFont} onChange={(e) => setSelectedFont(e.target.value)}>
            <optgroup label="Web Fonts">
              {availableFonts.web.map(font => (
                <option key={font.name} value={font.value}>{font.name}</option>
              ))}
            </optgroup>
            {availableFonts.system.length > 0 && (
              <optgroup label="System Fonts">
                {availableFonts.system.map(font => (
                  <option key={font} value={font}>{font}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="language-select">Translate to</label>
          <select
            id="language-select"
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
          >
            <option value="Korean">Korean</option>
            <option value="English">English</option>
            <option value="Japanese">Japanese</option>
            <option value="Chinese">Chinese</option>
            <option value="Spanish">Spanish</option>
            <option value="French">French</option>
            <option value="German">German</option>
          </select>
        </div>
        
        <div className="control-group glossary-section">
          <label htmlFor="glossary-original">Glossary</label>
          <ul className="glossary-list">
            {glossary.length === 0 ? (
              <li style={{ color: '#888', fontStyle: 'italic' }}>No terms added.</li>
            ) : (
              glossary.map(term => (
                <li key={term.id} className="glossary-item">
                  <span>{term.original} → {term.translated}</span>
                  <button onClick={() => handleDeleteGlossaryTerm(term.id)} className="glossary-delete-btn">×</button>
                </li>
              ))
            )}
          </ul>
          <div className="glossary-add-form">
            <input
              id="glossary-original"
              type="text"
              value={newGlossaryOriginal}
              onChange={(e) => setNewGlossaryOriginal(e.target.value)}
              placeholder="Original (e.g. 루카)"
            />
            <input
              type="text"
              value={newGlossaryTranslated}
              onChange={(e) => setNewGlossaryTranslated(e.target.value)}
              placeholder="Translated (e.g. Luka)"
            />
            <button onClick={handleAddGlossaryTerm}>Add</button>
          </div>
        </div>
        
        <div className="control-group">
           <button onClick={handleStartCapture}>
            Capture Screen Area
          </button>
        </div>
      </div>
      
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {error && <div className="error">{error}</div>}
      {loading && <div className="loading">Processing...</div>}
      
      {(originalText && !loading) && (
        <div className="results-container">
          <div className="result-panel-split">
            <div className="result-title">ORIGINAL TEXT</div>
            <div className="result-box">{originalText}</div>
          </div>
          <div className="result-panel-split">
            <div className="result-title">TRANSLATION SCRIPT</div>
            <div className="result-box">{translatedText || 'Translating...'}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;