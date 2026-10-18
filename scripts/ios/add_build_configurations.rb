#!/usr/bin/env ruby
# frozen_string_literal: true

# Legt die Build-Konfigurationen Debug-Local und Debug-LeoCloud an, verknuepft die xcconfig-Dateien
# aus swift/indooro-EinkaeuferFinal/Config/ und legt die geteilten Schemes
# "MCindooroApp (Local)", "MCindooroApp (LeoCloud)" und "MCindooroApp (Release)" an.
# Idempotent: vorhandene Konfigurationen, Dateireferenzen und Schemes werden nicht doppelt angelegt;
# Basis-Konfigurationen und Scheme-Dateien werden auf den Sollstand gesetzt.
#
#   gem install --user-install xcodeproj -v 1.27.0
#   LANG=en_US.UTF-8 ruby scripts/ios/add_build_configurations.rb
#
# Ergebnis im Projekt:
#   - Konfigurationen Debug-Local und Debug-LeoCloud auf Projekt-, App-, Test- und UITest-Ebene
#     (Kopie der Debug-Einstellungen, damit alle Schemes dieselben Konfigurationsnamen finden).
#   - MCindooroApp-Target: baseConfigurationReference
#       Debug          -> Config/Shared.xcconfig (Standardwert LeoCloud, Verhalten unveraendert)
#       Debug-Local    -> Config/Debug-Local.xcconfig (localhost:8080, ATS-Ausnahme nur hier)
#       Debug-LeoCloud -> Config/Debug-LeoCloud.xcconfig
#       Release        -> Config/Release.xcconfig (gleiche URL wie bisher)
#   - Geteilte Schemes unter xcshareddata/xcschemes; das bestehende Scheme "MCindooroApp" bleibt unveraendert.

require 'xcodeproj'
require 'fileutils'

ROOT = File.expand_path('../../swift/indooro-EinkaeuferFinal', __dir__)
PROJECT_PATH = File.join(ROOT, 'MCindooroApp.xcodeproj')
CONFIG_GROUP = 'Config'
NEW_CONFIGS = %w[Debug-Local Debug-LeoCloud].freeze
APP_TARGET = 'MCindooroApp'
TEST_TARGETS = %w[MCindooroAppTests MCindooroAppUITests].freeze
BASE_CONFIGS = {
  'Debug' => 'Shared.xcconfig',
  'Debug-Local' => 'Debug-Local.xcconfig',
  'Debug-LeoCloud' => 'Debug-LeoCloud.xcconfig',
  'Release' => 'Release.xcconfig'
}.freeze
# Schemes: Name => Konfiguration fuer Test/Launch/Analyze; Profile/Archive bleiben Release.
SCHEMES = {
  'MCindooroApp (Local)' => { 'run' => 'Debug-Local', 'test' => 'Debug-Local', 'analyze' => 'Debug-Local' },
  'MCindooroApp (LeoCloud)' => { 'run' => 'Debug-LeoCloud', 'test' => 'Debug-LeoCloud', 'analyze' => 'Debug-LeoCloud' },
  # Test laeuft gegen Debug: die Tests nutzen @testable import und brauchen ENABLE_TESTABILITY.
  'MCindooroApp (Release)' => { 'run' => 'Release', 'test' => 'Debug', 'analyze' => 'Release' }
}.freeze

project = Xcodeproj::Project.open(PROJECT_PATH)
root = project.root_object

# 1. Dateireferenzen fuer die xcconfig-Dateien in einer Gruppe "Config" (Pfad relativ zur Projektwurzel).
main_group = root.main_group
config_group = main_group.children.find { |c| c.is_a?(Xcodeproj::Project::Object::PBXGroup) && c.path == CONFIG_GROUP }
if config_group.nil?
  config_group = main_group.new_group(CONFIG_GROUP, CONFIG_GROUP)
  puts "added group #{CONFIG_GROUP}"
end
file_refs = {}
BASE_CONFIGS.values.uniq.each do |file_name|
  ref = config_group.children.find { |c| c.path == file_name }
  if ref.nil?
    ref = config_group.new_file(file_name)
    puts "added file reference #{file_name}"
  end
  file_refs[file_name] = ref
end

# 2. Konfigurationen anlegen (Kopie von Debug).
def ensure_configuration(project, config_list, name, template_name)
  return if config_list.build_configurations.any? { |c| c.name == name }

  template = config_list.build_configurations.find { |c| c.name == template_name }
  abort "Vorlage #{template_name} fehlt in #{config_list.display_name}" if template.nil?

  copy = project.new(Xcodeproj::Project::Object::XCBuildConfiguration)
  copy.name = name
  copy.build_settings = template.build_settings.dup
  config_list.build_configurations << copy
  puts "#{config_list.display_name}: Konfiguration #{name} angelegt"
end

def configuration_list_for(target_or_project)
  target_or_project.build_configuration_list
end

configuration_list_for(project.root_object).then do |list|
  NEW_CONFIGS.each { |name| ensure_configuration(project, list, name, 'Debug') }
end

targets = project.targets.select { |t| [APP_TARGET, *TEST_TARGETS].include?(t.name) }
abort "Targets fehlen" unless targets.map(&:name).sort == [APP_TARGET, *TEST_TARGETS].sort
targets.each do |target|
  NEW_CONFIGS.each { |name| ensure_configuration(project, target.build_configuration_list, name, 'Debug') }
end

# 3. Basis-Konfigurationen (xcconfig) am App-Target setzen.
app = targets.find { |t| t.name == APP_TARGET }
app.build_configuration_list.build_configurations.each do |config|
  file_name = BASE_CONFIGS[config.name]
  next if file_name.nil?

  wanted = file_refs.fetch(file_name)
  next if config.base_configuration_reference == wanted

  config.base_configuration_reference = wanted
  puts "#{APP_TARGET} #{config.name}: base configuration #{file_name}"
end

project.save
puts "saved #{PROJECT_PATH}"

# 4. Geteilte Schemes aus dem bestehenden Scheme MCindooroApp ableiten (nur die Konfigurationsnamen aendern).
source_scheme = File.join(ROOT, 'MCindooroApp.xcodeproj/xcshareddata/xcschemes/MCindooroApp.xcscheme')
source = File.read(source_scheme)
SCHEMES.each do |scheme_name, configs|
  content = source.dup
  {
    'TestAction' => configs['test'],
    'LaunchAction' => configs['run'],
    'AnalyzeAction' => configs['analyze'],
    'ProfileAction' => 'Release',
    'ArchiveAction' => 'Release'
  }.each do |action, config_name|
    content = content.sub(/(<#{action}\b[^>]*?buildConfiguration = ")[^"]*(")/m) { "#{Regexp.last_match(1)}#{config_name}#{Regexp.last_match(2)}" }
  end
  target_path = File.join(ROOT, "MCindooroApp.xcodeproj/xcshareddata/xcschemes/#{scheme_name}.xcscheme")
  if File.exist?(target_path) && File.read(target_path) == content
    puts "scheme #{scheme_name}: unveraendert"
  else
    File.write(target_path, content)
    puts "scheme #{scheme_name}: geschrieben"
  end
end
