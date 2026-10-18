//
//  Product.swift
//  indooroApp
//
//  Created by Erik Bergmair on 07.02.26.
//

import Foundation

public struct Product: Codable, Identifiable, Hashable, Sendable {
    public let id: Int
    public let name: String
    public let price: Double
    public let layoutCode: String // z.B. "310/1/1/1"

    public init(id: Int, name: String, price: Double, layoutCode: String) {
        self.id = id
        self.name = name
        self.price = price
        self.layoutCode = layoutCode
    }
}
