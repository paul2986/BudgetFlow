
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
    // Forwarding errors to a parent frame is only useful inside the dev/preview
    // harness. Doing it in production would leak error payloads (which can contain
    // user/financial context) to any embedding page via the wildcard origin, so
    // restrict it to development builds only.
    const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
    if (isDev && typeof window !== 'undefined' && window.parent && window.parent !== window) {
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
      // Production (or no parent window): log locally only.
      console.error('🚨 ERROR:', level, message, data);
    }
  } catch (error) {
    console.error('❌ Failed to send error to parent:', error);
  }
};

const isSymbolicateRequest = (input: unknown): boolean => {
  const url =
    typeof input === 'string' ? input
    : input instanceof URL ? input.href
    : (input as { url?: unknown } | null)?.url;
  return typeof url === 'string' && url.split('?')[0].endsWith('/symbolicate');
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
    type GlobalErrorHandler = (error: Error, isFatal?: boolean) => void;
    const errorUtils = (globalThis as typeof globalThis & {
      ErrorUtils?: {
        getGlobalHandler?: () => GlobalErrorHandler;
        setGlobalHandler?: (handler: GlobalErrorHandler) => void;
      };
    }).ErrorUtils;
    const originalHandler = errorUtils?.getGlobalHandler?.();

    errorUtils?.setGlobalHandler?.((error, isFatal) => {
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
  const originalFetch = globalThis.fetch;
  if (originalFetch) {
    globalThis.fetch = (...args) => {
      return originalFetch(...args).catch((error) => {
        // In development, LogBox resolves every console.error's stack through
        // the dev server's /symbolicate. If Metro is down, logging that failure
        // triggers another symbolicate request, and so on without end. It's
        // dev-tool traffic, not an app error, so pass it through silently.
        if (isSymbolicateRequest(args[0])) throw error;
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
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: TimerHandler, delay?: number, ...args: any[]) => {
    const wrappedCallback = (...callbackArgs: any[]) => {
      try {
        if (typeof callback === 'function') {
          return callback(...callbackArgs);
        }
        // String callbacks (implicit eval) are intentionally not supported.
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
  }) as typeof globalThis.setTimeout;

  const originalSetInterval = globalThis.setInterval;
  globalThis.setInterval = ((callback: TimerHandler, delay?: number, ...args: any[]) => {
    const wrappedCallback = (...callbackArgs: any[]) => {
      try {
        if (typeof callback === 'function') {
          return callback(...callbackArgs);
        }
        // String callbacks (implicit eval) are intentionally not supported.
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
  }) as typeof globalThis.setInterval;

  console.log('✅ Comprehensive error logging setup complete');
};
