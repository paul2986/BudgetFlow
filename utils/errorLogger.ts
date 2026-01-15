
// Global error logging for runtime errors

import { Platform } from "react-native";

// Simple debouncing to prevent duplicate errors
const recentErrors: { [key: string]: boolean } = {};
const clearErrorAfterDelay = (errorKey: string) => {
  setTimeout(() => delete recentErrors[errorKey], 100);
};

// Function to send errors to parent window (React frontend)
const sendErrorToParent = (level: string, message: string, data: any) => {
  // Create a simple key to identify duplicate errors
  const errorKey = `${level}:${message}:${JSON.stringify(data)}`;

  // Skip if we've seen this exact error recently
  if (recentErrors[errorKey]) {
    return;
  }

  // Mark this error as seen and schedule cleanup
  recentErrors[errorKey] = true;
  clearErrorAfterDelay(errorKey);

  try {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'EXPO_ERROR',
        level: level,
        message: message,
        data: data,
        timestamp: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        source: 'expo-template'
      }, '*');
    } else {
      // Fallback to console if no parent window
      console.error('🚨 ERROR (no parent):', level, message, data);
    }
  } catch (error) {
    console.error('❌ Failed to send error to parent:', error);
  }
};

// Function to extract meaningful source location from stack trace
const extractSourceLocation = (stack: string): string => {
  if (!stack) return '';

  // Look for various patterns in the stack trace
  const patterns = [
    // Pattern for app files: app/filename.tsx:line:column
    /at .+\/(app\/[^:)]+):(\d+):(\d+)/,
    // Pattern for components: components/filename.tsx:line:column
    /at .+\/(components\/[^:)]+):(\d+):(\d+)/,
    // Pattern for any .tsx/.ts files
    /at .+\/([^/]+\.tsx?):(\d+):(\d+)/,
    // Pattern for bundle files with source maps
    /at .+\/([^/]+\.bundle[^:]*):(\d+):(\d+)/,
    // Pattern for any JavaScript file
    /at .+\/([^/\s:)]+\.[jt]sx?):(\d+):(\d+)/
  ];

  for (const pattern of patterns) {
    const match = stack.match(pattern);
    if (match) {
      return ` | Source: ${match[1]}:${match[2]}:${match[3]}`;
    }
  }

  // If no specific pattern matches, try to find any file reference
  const fileMatch = stack.match(/at .+\/([^/\s:)]+\.[jt]sx?):(\d+)/);
  if (fileMatch) {
    return ` | Source: ${fileMatch[1]}:${fileMatch[2]}`;
  }

  return '';
};

// Function to get caller information from stack trace
const getCallerInfo = (): string => {
  const stack = new Error().stack || '';
  const lines = stack.split('\n');

  // Skip the first few lines (Error, getCallerInfo, console override)
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (line.indexOf('app/') !== -1 || line.indexOf('components/') !== -1 || line.indexOf('.tsx') !== -1 || line.indexOf('.ts') !== -1) {
      const match = line.match(/at .+\/([^/\s:)]+\.[jt]sx?):(\d+):(\d+)/);
      if (match) {
        return ` | Called from: ${match[1]}:${match[2]}:${match[3]}`;
      }
    }
  }

  return '';
};

export const setupErrorLogging = () => {
  console.log('🔧 Setting up comprehensive error logging...');

  // Capture unhandled errors in web environment
  if (typeof window !== 'undefined' && Platform.OS === 'web' && typeof window.addEventListener === 'function') {
    // Override window.onerror to catch JavaScript errors (only if it exists)
    const originalOnError = window.onerror;
    if (typeof window.onerror !== 'undefined') {
      window.onerror = (message, source, lineno, colno, error) => {
        const sourceFile = source ? source.split('/').pop() : 'unknown';
        const errorData = {
          message: message,
          source: `${sourceFile}:${lineno}:${colno}`,
          line: lineno,
          column: colno,
          error: error?.stack || error,
          timestamp: new Date().toISOString()
        };

        console.error('🚨 RUNTIME ERROR:', errorData);
        sendErrorToParent('error', 'JavaScript Runtime Error', errorData);
        
        // Call original handler if it exists
        if (originalOnError && typeof originalOnError === 'function') {
          try {
            return originalOnError.call(window, message, source, lineno, colno, error);
          } catch (e) {
            console.error('Error in original error handler:', e);
          }
        }
        
        return false; // Don't prevent default error handling
      };
    } else {
      console.log('🔧 window.onerror not available, skipping error handler override');
    }

    // Capture unhandled promise rejections with comprehensive handling (only if it exists)
    const originalUnhandledRejection = window.onunhandledrejection;
    if (typeof window.onunhandledrejection !== 'undefined') {
      window.onunhandledrejection = (event) => {
        const errorData = {
          reason: event.reason,
          promise: event.promise,
          timestamp: new Date().toISOString(),
          stack: event.reason?.stack || 'No stack trace available',
          message: event.reason?.message || String(event.reason)
        };

        console.error('🚨 UNHANDLED PROMISE REJECTION:', errorData);
        sendErrorToParent('error', 'Unhandled Promise Rejection', errorData);
        
        // Call original handler if it exists
        if (originalUnhandledRejection && typeof originalUnhandledRejection === 'function') {
          try {
            return originalUnhandledRejection.call(window, event);
          } catch (e) {
            console.error('Error in original unhandled rejection handler:', e);
          }
        }
        
        // Prevent the default behavior (which would log to console)
        event.preventDefault();
      };
    } else {
      console.log('🔧 window.onunhandledrejection not available, skipping rejection handler override');
    }

    // Also add event listener as backup (only if addEventListener exists)
    if (typeof window.addEventListener === 'function') {
      try {
        window.addEventListener('unhandledrejection', (event) => {
          const errorData = {
            reason: event.reason,
            timestamp: new Date().toISOString(),
            stack: event.reason?.stack || 'No stack trace available',
            message: event.reason?.message || String(event.reason)
          };

          console.error('🚨 UNHANDLED PROMISE REJECTION (listener):', errorData);
          sendErrorToParent('error', 'Unhandled Promise Rejection', errorData);
        });

        // Add error event listener for additional coverage
        window.addEventListener('error', (event) => {
          const errorData = {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error?.stack || event.error,
            timestamp: new Date().toISOString()
          };

          console.error('🚨 ERROR EVENT:', errorData);
          sendErrorToParent('error', 'Error Event', errorData);
        });
        
        console.log('✅ Web event listeners set up successfully');
      } catch (error) {
        console.error('❌ Failed to set up web event listeners:', error);
      }
    } else {
      console.log('🔧 addEventListener not available, skipping event listeners');
    }
  }

  // React Native specific error handling
  if (Platform.OS !== 'web') {
    // Set up React Native error handler
    const originalHandler = global.ErrorUtils?.getGlobalHandler?.();
    
    global.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
      const errorData = {
        message: error.message,
        stack: error.stack,
        isFatal,
        timestamp: new Date().toISOString()
      };

      console.error('🚨 REACT NATIVE ERROR:', errorData);
      sendErrorToParent('error', 'React Native Error', errorData);
      
      // Call original handler if it exists
      if (originalHandler && typeof originalHandler === 'function') {
        try {
          originalHandler(error, isFatal);
        } catch (e) {
          console.error('Error in original React Native error handler:', e);
        }
      }
    });
  }

  // Wrap common async operations to catch unhandled rejections
  const originalFetch = global.fetch;
  if (originalFetch) {
    global.fetch = (...args) => {
      return originalFetch(...args).catch((error) => {
        console.error('🚨 FETCH ERROR:', error);
        sendErrorToParent('error', 'Fetch Error', {
          url: args[0],
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
        throw error; // Re-throw to maintain original behavior
      });
    };
  }

  // Wrap setTimeout and setInterval to catch errors
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (callback, delay, ...args) => {
    const wrappedCallback = (...callbackArgs: any[]) => {
      try {
        if (typeof callback === 'function') {
          return callback(...callbackArgs);
        } else if (typeof callback === 'string') {
          // Handle string callbacks (eval)
          return eval(callback);
        }
      } catch (error) {
        console.error('🚨 SETTIMEOUT ERROR:', error);
        sendErrorToParent('error', 'SetTimeout Error', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : 'No stack trace',
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    };
    return originalSetTimeout(wrappedCallback, delay, ...args);
  };

  const originalSetInterval = global.setInterval;
  global.setInterval = (callback, delay, ...args) => {
    const wrappedCallback = (...callbackArgs: any[]) => {
      try {
        if (typeof callback === 'function') {
          return callback(...callbackArgs);
        } else if (typeof callback === 'string') {
          // Handle string callbacks (eval)
          return eval(callback);
        }
      } catch (error) {
        console.error('🚨 SETINTERVAL ERROR:', error);
        sendErrorToParent('error', 'SetInterval Error', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : 'No stack trace',
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    };
    return originalSetInterval(wrappedCallback, delay, ...args);
  };

  console.log('✅ Comprehensive error logging setup complete');
};
