#!/usr/bin/env ruby
# frozen_string_literal: true

# Adds the unit test bundle MCindooroAppTests to MCindooroApp.xcodeproj without Xcode.
# Idempotent: exits without changes when the target already exists.
#
#   gem install --user-install xcodeproj -v 1.27.0
#   LANG=en_US.UTF-8 ruby scripts/ios/add_unit_test_target.rb
#
# Result: native unit test target (host app MCindooroApp, synchronized folder
# swift/indooro-EinkaeuferFinal/MCindooroAppTests) and a shared scheme "MCindooroApp"
# whose test action runs the bundle.

require 'xcodeproj'
require 'fileutils'

ROOT = File.expand_path('../../swift/indooro-EinkaeuferFinal', __dir__)
PROJECT_PATH = File.join(ROOT, 'MCindooroApp.xcodeproj')
TEST_NAME = 'MCindooroAppTests'
APP_NAME = 'MCindooroApp'
TEST_BUNDLE_ID = 'at.ac.htl.leonding.indooroswift2.tests'

project = Xcodeproj::Project.open(PROJECT_PATH)

if project.targets.any? { |t| t.name == TEST_NAME }
  puts "#{TEST_NAME} exists already, nothing to do"
  exit 0
end

app = project.targets.find { |t| t.name == APP_NAME } or abort "target #{APP_NAME} not found"
app_debug = app.build_configurations.find { |c| c.name == 'Debug' }.build_settings
deployment = project.build_configurations.first.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] || '18.5'

FileUtils.mkdir_p(File.join(ROOT, TEST_NAME))

test_target = project.new_target(:unit_test_bundle, TEST_NAME, :ios, deployment, nil, :swift)
test_target.add_dependency(app)

# new_target links Foundation.framework through a path that is pinned to one SDK
# version; XCTest bundles do not need it, so drop file reference and Frameworks group.
test_target.frameworks_build_phase.clear
project.frameworks_group.clear
project.frameworks_group.remove_from_project

group = project.new(Xcodeproj::Project::Object::PBXFileSystemSynchronizedRootGroup)
group.path = TEST_NAME
group.source_tree = '<group>'
project.main_group.children.insert(project.main_group.children.index { |c| c.display_name == 'Products' } || -1, group)
test_target.file_system_synchronized_groups << group

test_target.build_configurations.each do |config|
  s = config.build_settings
  s['BUNDLE_LOADER'] = '$(TEST_HOST)'
  s['TEST_HOST'] = "$(BUILT_PRODUCTS_DIR)/#{APP_NAME}.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/#{APP_NAME}"
  s['CODE_SIGN_STYLE'] = 'Automatic'
  s['DEVELOPMENT_TEAM'] = app_debug['DEVELOPMENT_TEAM']
  s['GENERATE_INFOPLIST_FILE'] = 'YES'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = deployment
  s['MARKETING_VERSION'] = '1.0'
  s['CURRENT_PROJECT_VERSION'] = '1'
  s['PRODUCT_BUNDLE_IDENTIFIER'] = TEST_BUNDLE_ID
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['SWIFT_EMIT_LOC_STRINGS'] = 'NO'
  s['SWIFT_VERSION'] = app_debug['SWIFT_VERSION']
  s['TARGETED_DEVICE_FAMILY'] = app_debug['TARGETED_DEVICE_FAMILY']
end

project.save

# Shared scheme with test action.
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.add_test_target(test_target)
scheme.set_launch_target(app)
scheme.save_as(PROJECT_PATH, APP_NAME, true)

puts "added #{TEST_NAME} and shared scheme #{APP_NAME}"
