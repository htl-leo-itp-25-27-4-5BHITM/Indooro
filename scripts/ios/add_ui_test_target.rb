#!/usr/bin/env ruby
# frozen_string_literal: true

# Adds the UI test bundle MCindooroAppUITests to MCindooroApp.xcodeproj without Xcode and
# registers it in the shared scheme "MCindooroApp". Idempotent: exits without changes when
# the target already exists. Counterpart of add_unit_test_target.rb.
#
#   gem install --user-install xcodeproj -v 1.27.0
#   LANG=en_US.UTF-8 ruby scripts/ios/add_ui_test_target.rb

require 'xcodeproj'
require 'fileutils'

ROOT = File.expand_path('../../swift/indooro-EinkaeuferFinal', __dir__)
PROJECT_PATH = File.join(ROOT, 'MCindooroApp.xcodeproj')
TEST_NAME = 'MCindooroAppUITests'
APP_NAME = 'MCindooroApp'
TEST_BUNDLE_ID = 'at.ac.htl.leonding.indooroswift2.uitests'

project = Xcodeproj::Project.open(PROJECT_PATH)

if project.targets.any? { |t| t.name == TEST_NAME }
  puts "#{TEST_NAME} exists already, nothing to do"
  exit 0
end

app = project.targets.find { |t| t.name == APP_NAME } or abort "target #{APP_NAME} not found"
app_debug = app.build_configurations.find { |c| c.name == 'Debug' }.build_settings
deployment = project.build_configurations.first.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] || '18.5'

FileUtils.mkdir_p(File.join(ROOT, TEST_NAME))

test_target = project.new_target(:ui_test_bundle, TEST_NAME, :ios, deployment, nil, :swift)
test_target.add_dependency(app)

# new_target links Foundation.framework through a path pinned to one SDK version; not needed.
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
  s['TEST_TARGET_NAME'] = APP_NAME
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

scheme_path = Xcodeproj::XCScheme.shared_data_dir(PROJECT_PATH) + "#{APP_NAME}.xcscheme"
scheme = File.exist?(scheme_path) ? Xcodeproj::XCScheme.new(scheme_path) : Xcodeproj::XCScheme.new
if scheme.test_action.testables.empty?
  scheme.add_build_target(app)
  scheme.set_launch_target(app)
end
scheme.add_test_target(test_target)
scheme.save_as(PROJECT_PATH, APP_NAME, true)

puts "added #{TEST_NAME} to the project and to shared scheme #{APP_NAME}"
