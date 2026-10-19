// MLFix - inyecta polyfills + diagnostico en WKWebView (iOS 12)
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

static NSString *const kPolyPath    = @"/Library/Application Support/MLFix/polyfills.js";
static NSString *const kHandlerName = @"MLFixLog";
static NSString *const kMarker      = @"/*MLFIX*/";
static NSUInteger gErrors = 0;

// ---------- LOG ----------
// Salida: NSLog (idevicesyslog | grep MLFix) + archivo
//   /var/mobile/Library/Logs/MLFix.log  (si el proceso puede escribir ahi)
//   o NSTemporaryDirectory()/MLFix.log  (fallback, dentro del sandbox de la app)
static void MLFixLog(NSString *fmt, ...) {
    va_list args; va_start(args, fmt);
    NSString *msg = [[NSString alloc] initWithFormat:fmt arguments:args];
    va_end(args);
    NSLog(@"[MLFix] %@", msg);

    NSString *line = [NSString stringWithFormat:@"%@ [%@] %@\n", [NSDate date],
                      [[NSProcessInfo processInfo] processName], msg];
    NSData *data = [line dataUsingEncoding:NSUTF8StringEncoding];
    NSArray *paths = @[@"/var/mobile/Library/Logs/MLFix.log",
                       [NSTemporaryDirectory() stringByAppendingPathComponent:@"MLFix.log"]];
    for (NSString *p in paths) {
        NSFileHandle *fh = [NSFileHandle fileHandleForWritingAtPath:p];
        if (!fh) {
            if ([data writeToFile:p atomically:NO]) break;
            continue;
        }
        @try { [fh seekToEndOfFile]; [fh writeData:data]; [fh closeFile]; break; }
        @catch (NSException *e) { continue; }
    }
}

// ---------- Receptor de mensajes desde el JS ----------
@interface MLFixHandler : NSObject <WKScriptMessageHandler>
@end

@implementation MLFixHandler
- (void)userContentController:(WKUserContentController *)ucc
      didReceiveScriptMessage:(WKScriptMessage *)message {
    if (![message.body isKindOfClass:[NSDictionary class]]) {
        MLFixLog(@"%@", message.body);
        return;
    }
    NSDictionary *d = message.body;
    NSString *kind = d[@"k"] ?: @"info";
    NSString *msg  = d[@"m"] ?: @"";
    NSString *url  = d[@"u"] ?: @"";
    MLFixLog(@"[%@] %@  <%@>", kind, msg, url);

    if ([kind isEqualToString:@"error"] || [kind isEqualToString:@"reject"]) {
        gErrors++;
        NSString *lower = msg.lowercaseString;
        if ([lower containsString:@"unexpected token"] || [lower containsString:@"syntaxerror"]) {
            MLFixLog(@"DIAGNOSTICO: error de SINTAXIS. El script usa sintaxis que el WebKit de iOS 12 no parsea (?. ?? class fields, etc). Un polyfill NO lo arregla; habria que transpilar con Babel.");
        } else if ([lower containsString:@"is not a function"] || [lower containsString:@"undefined is not an object"] || [lower containsString:@"can't find variable"]) {
            MLFixLog(@"DIAGNOSTICO: falta una API en iOS 12. Mira la linea de arriba y agrega ese polyfill en polyfills.js (no hace falta recompilar).");
        } else if ([lower hasPrefix:@"script error"]) {
            MLFixLog(@"DIAGNOSTICO: 'Script error.' = script de otro dominio (cross-origin), WebKit oculta el detalle. Usa Inspector Web para ver el error real.");
        }
    }
}
@end

static MLFixHandler *MLFixSharedHandler(void) {
    static MLFixHandler *h; static dispatch_once_t once;
    dispatch_once(&once, ^{ h = [MLFixHandler new]; });
    return h;
}

// ---------- Hooks ----------
%hook WKWebView

- (instancetype)initWithFrame:(CGRect)frame configuration:(WKWebViewConfiguration *)config {
    if (!config) config = [[WKWebViewConfiguration alloc] init];
    @try {
        WKUserContentController *ucc = config.userContentController;

        BOOL already = NO;
        for (WKUserScript *s in ucc.userScripts) {
            if ([s.source hasPrefix:kMarker]) { already = YES; break; }
        }

        if (!already) {
            NSString *js = [NSString stringWithContentsOfFile:kPolyPath
                                                     encoding:NSUTF8StringEncoding error:nil];
            if (js.length) {
                [ucc removeScriptMessageHandlerForName:kHandlerName];
                [ucc addScriptMessageHandler:MLFixSharedHandler() name:kHandlerName];

                NSString *full = [kMarker stringByAppendingString:js];
                WKUserScript *us = [[WKUserScript alloc]
                    initWithSource:full
                     injectionTime:WKUserScriptInjectionTimeAtDocumentStart
                  forMainFrameOnly:NO]; // NO = tambien iframes (el captcha suele ir en iframe)
                [ucc addUserScript:us];
                MLFixLog(@"WKWebView creado: script inyectado (%lu bytes)", (unsigned long)js.length);
            } else {
                MLFixLog(@"ERROR: no pude leer %@ (reinstala el .deb)", kPolyPath);
            }
        }
    } @catch (NSException *e) {
        MLFixLog(@"EXCEPCION al inyectar: %@", e);
    }
    return %orig(frame, config);
}

- (WKNavigation *)loadRequest:(NSURLRequest *)request {
    MLFixLog(@"loadRequest -> %@", request.URL.absoluteString);
    return %orig;
}

%end

%ctor {
    MLFixLog(@"cargado en %@ | iOS %@ | filtro OK",
             [[NSProcessInfo processInfo] processName],
             [[UIDevice currentDevice] systemVersion]);
}
