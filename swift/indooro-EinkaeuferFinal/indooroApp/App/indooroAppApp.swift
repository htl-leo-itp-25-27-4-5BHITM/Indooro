//
//  indooroAppApp.swift
//  indooroApp
//
//  Created by Erik Bergmair on 07.01.26.
//

import SwiftUI

@main
struct indooroAppApp: App {
    private let dependencies = AppDependencies.live

    var body: some Scene {
        WindowGroup {
            ContentView(dependencies: dependencies)
                .environment(\.appDependencies, dependencies)
        }
    }
}
