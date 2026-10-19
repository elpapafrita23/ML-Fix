TARGET := iphone:clang:latest:12.0
ARCHS = arm64 arm64e
INSTALL_TARGET_PROCESSES = MobileSafari

include $(THEOS)/makefiles/common.mk

TWEAK_NAME = MLFix
MLFix_FILES = Tweak.x
MLFix_CFLAGS = -fobjc-arc
MLFix_FRAMEWORKS = Foundation UIKit WebKit

include $(THEOS_MAKE_PATH)/tweak.mk
