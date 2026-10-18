#!/usr/bin/env ruby
# frozen_string_literal: true

# Verknuepft das Produkt IndooroModels (Datenmodelle, Phase 4 von modernize-ios-client-architecture) aus dem
# lokalen Swift-Paket swift/indooro-EinkaeuferFinal/Packages/IndooroKit mit MCindooroApp.xcodeproj. Idempotent:
# vorhandene Referenzen werden nicht doppelt angelegt. Die Paketreferenz "Packages/IndooroKit" legt
# scripts/ios/add_indoorokit_package.rb an; dieses Skript setzt sie voraus und legt sie nur an, falls sie fehlt.
#
#   gem install --user-install xcodeproj -v 1.27.0
#   LANG=en_US.UTF-8 ruby scripts/ios/add_indoorokit_models.rb
#
# Ergebnis:
#   - XCSwiftPackageProductDependency "IndooroModels" fuer das App-Target MCindooroApp, mit PBXBuildFile
#     in der Frameworks-Build-Phase (wie IndooroNetworking, statische Bibliothek).
#   - Das Test-Bundle MCindooroAppTests verlinkt das Produkt NICHT (gleiche Begruendung wie in
#     add_indoorokit_package.rb: doppelte statische Symbole, Test-Host sieht die Symbole ueber die App).
#
# Builds mit xcodebuild immer mit -skipPackagePluginValidation aufrufen (siehe scripts/ios/run-ui-tests.sh).

require 'xcodeproj'

ROOT = File.expand_path('../../swift/indooro-EinkaeuferFinal', __dir__)
PROJECT_PATH = File.join(ROOT, 'MCindooroApp.xcodeproj')
PACKAGE_RELATIVE_PATH = 'Packages/IndooroKit'
PRODUCT_NAME = 'IndooroModels'
TARGET_NAMES = %w[MCindooroApp].freeze

project = Xcodeproj::Project.open(PROJECT_PATH)
root = project.root_object

package_ref = root.package_references.find do |ref|
  ref.is_a?(Xcodeproj::Project::Object::XCLocalSwiftPackageReference) &&
    ref.relative_path == PACKAGE_RELATIVE_PATH
end

if package_ref.nil?
  package_ref = project.new(Xcodeproj::Project::Object::XCLocalSwiftPackageReference)
  package_ref.relative_path = PACKAGE_RELATIVE_PATH
  root.package_references << package_ref
  puts "added local package reference #{PACKAGE_RELATIVE_PATH}"
end

TARGET_NAMES.each do |target_name|
  target = project.targets.find { |t| t.name == target_name }
  abort "target #{target_name} not found" if target.nil?

  if target.package_product_dependencies.any? { |dep| dep.product_name == PRODUCT_NAME }
    puts "#{target_name}: #{PRODUCT_NAME} already linked"
    next
  end

  dependency = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
  dependency.product_name = PRODUCT_NAME
  dependency.package = package_ref
  target.package_product_dependencies << dependency

  build_file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
  build_file.product_ref = dependency
  target.frameworks_build_phase.files << build_file
  puts "#{target_name}: linked #{PRODUCT_NAME}"
end

project.save
puts "saved #{PROJECT_PATH}"
