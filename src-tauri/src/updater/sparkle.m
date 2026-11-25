#import <Foundation/Foundation.h>
#include <stdbool.h>

// Load Sparkle only from this app's signed bundle. Unbundled development
// executables can run without installing the release framework on the machine.
@interface RPUpdaterController : NSObject
- (instancetype)initWithStartingUpdater:(BOOL)startUpdater
                        updaterDelegate:(id)updaterDelegate
                     userDriverDelegate:(id)driverDelegate;
- (void)checkForUpdates:(id)sender;
@end

static RPUpdaterController *controller;

void rp_start_updater(void) {
    NSCAssert(NSThread.isMainThread, @"Sparkle requires the main thread");
    NSBundle *app = NSBundle.mainBundle;
    if (controller || ![app.bundleURL.pathExtension isEqualToString:@"app"]) return;

    NSURL *url = [app.privateFrameworksURL URLByAppendingPathComponent:@"Sparkle.framework"];
    NSBundle *framework = [NSBundle bundleWithURL:url];
    NSError *error = nil;
    if (![framework loadAndReturnError:&error]) {
        NSLog(@"RunProject could not load Sparkle at %@: %@", url, error);
        return;
    }

    Class updaterClass = [framework classNamed:@"SPUStandardUpdaterController"];
    controller = [[updaterClass alloc] initWithStartingUpdater:YES
                                               updaterDelegate:nil
                                            userDriverDelegate:nil];
}

bool rp_check_for_updates(void) {
    NSCAssert(NSThread.isMainThread, @"Sparkle requires the main thread");
    if (!controller) return false;
    [controller checkForUpdates:nil];
    return true;
}
