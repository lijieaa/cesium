import { defined } from "../../Source/Cesium.js";
import { defaultValue } from "../../Source/Cesium.js";
import { FeatureDetection } from "../../Source/Cesium.js";
import { MetadataClass } from "../../Source/Cesium.js";
import { MetadataTable } from "../../Source/Cesium.js";
import { MetadataType } from "../../Source/Cesium.js";
import MetadataEnum from "../../Source/Scene/MetadataEnum.js";

describe("Scene/MetadataTable", function () {
  // hasProperty - > take tests from other file
  // getPropertyIds -> take tests for other file
  // getProperty
  //   gets string
  //   gets string after being unpacked
  //   gets float32, gets int, etc
  //   gets boolean
  //   gets fixed sized array of the above
  //   gets variable sized array of the above (test some zero-length mixed in)
  //   gets variable sized array after unpack (check clone)
  //   gets default value if property is missing
  //   gets undefined if property doesn't exist
  //   throws if index if out of bounds
  //   throws if propertyId is not defined
  // setProperty
  //   throws if index if out of bounds
  //   throws if value type does not match
  //     type is ARRAY and value is not array
  //     type is fixed-size array and the length of value does not match componentCount
  //     type is ARRAY and there's a mismatch in the array values (not all the cases here)
  //     type checks for all int/uint/float types, strings, bools
  //     out of range checks for int/uint/float types
  //   throws if propertyId is not defined
  //   does not set if property doesn't exist
  //   sets string causes unpack (array and non array variant)
  //   sets variable size array where lengths don't match causes a unpack
  //   sets float32, sets int, etc
  //   sets fixed size array
  //   sets variable sized array of same length
  //   sets different indices (0, 1, etc)
  // getPropertyBySemantic
  //   throws if index if out of bounds
  //   throws if semantic is not defined
  //   gets undefined if semantic does not exist (see MetadataTilesetSpec)
  //   gets value if semantic exists (check clone)
  // setPropertyBySemantic
  //   throws if index if out of bounds
  //   throws if semantic is not defined
  //   throws if value type does not match
  // test reading buffer view that is not at index 0 (e.g. concatted bufferviews)
  // don't run tests if platform doesn't support TextEncoder
  // don't run tests if platform doesn't support BigUint64Array (maybe just certain tests)

  function createBuffer(values, type) {
    var typedArray;
    switch (type) {
      case MetadataType.INT8:
        typedArray = new Int8Array(values);
        break;
      case MetadataType.UINT8:
        typedArray = new Uint8Array(values);
        break;
      case MetadataType.INT16:
        typedArray = new Int16Array(values);
        break;
      case MetadataType.UINT16:
        typedArray = new Uint16Array(values);
        break;
      case MetadataType.INT32:
        typedArray = new Int32Array(values);
        break;
      case MetadataType.UINT32:
        typedArray = new Uint32Array(values);
        break;
      case MetadataType.INT64:
        typedArray = new BigInt64Array(values); // eslint-disable-line
        break;
      case MetadataType.UINT64:
        typedArray = new BigUint64Array(values); // eslint-disable-line
        break;
      case MetadataType.FLOAT32:
        typedArray = new Float32Array(values);
        break;
      case MetadataType.FLOAT64:
        typedArray = new Float64Array(values);
        break;
      case MetadataType.STRING:
        var encoder = new TextEncoder();
        typedArray = encoder.encode(values.join(""));
        break;
      case MetadataType.BOOLEAN:
        var length = Math.ceil(values.length / 8);
        typedArray = new Uint8Array(length); // Initialized as 0's
        for (var i = 0; i < values.length; ++i) {
          var byteIndex = i >> 3;
          var bitIndex = i % 8;
          if (values[i]) {
            typedArray[byteIndex] |= 1 << bitIndex;
          }
        }
        break;
    }

    return new Uint8Array(typedArray.buffer);
  }

  function createValuesBuffer(values, classProperty) {
    var valueType = classProperty.valueType;
    var enumType = classProperty.enumType;
    var flattenedValues = [].concat.apply([], values);

    if (defined(enumType)) {
      var length = flattenedValues.length;
      for (var i = 0; i < length; ++i) {
        flattenedValues[i] = enumType.valuesByName[flattenedValues[i]];
      }
    }

    return createBuffer(flattenedValues, valueType);
  }

  function createStringOffsetBuffer(values, offsetType) {
    var strings = [].concat.apply([], values);
    var length = strings.length;
    var offsets = new Array(length + 1);
    var offset = 0;
    for (var i = 0; i < length; ++i) {
      offsets[i] = offset;
      offset += strings[i].length;
    }
    offsets[length] = offset;
    offsetType = defaultValue(offsetType, MetadataType.UINT32);
    return createBuffer(offsets, offsetType);
  }

  function createArrayOffsetBuffer(values, offsetType) {
    var length = values.length;
    var offsets = new Array(length + 1);
    var offset = 0;
    for (var i = 0; i < length; ++i) {
      offsets[i] = offset;
      offset += values[i].length;
    }
    offsets[length] = offset;
    offsetType = defaultValue(offsetType, MetadataType.UINT32);
    return createBuffer(offsets, offsetType);
  }

  function addPadding(uint8Array) {
    // This tests that MetadataTable uses the Uint8Array's byteOffset properly
    var paddingBytes = 8;
    var padded = new Uint8Array(paddingBytes + uint8Array.length);
    padded.set(uint8Array, paddingBytes);
    return new Uint8Array(padded.buffer, paddingBytes, uint8Array.length);
  }

  function createTable(options) {
    options = defaultValue(options, defaultValue.EMPTY_OBJECT);
    var propertiesJson = options.properties;
    var propertyValues = options.propertyValues;
    var enums = defaultValue(options.enums, defaultValue.EMPTY_OBJECT);
    var offsetType = options.offsetType;
    var disableBigIntSupport = options.disableBigIntSupport;
    var disableBigInt64ArraySupport = options.disableBigInt64ArraySupport;
    var disableBigUint64ArraySupport = options.disableBigUint64ArraySupport;

    var enumDefinitions = {};
    for (var enumId in enums) {
      if (enums.hasOwnProperty(enumId)) {
        enumDefinitions[enumId] = new MetadataEnum({
          id: enumId,
          enum: enums[enumId],
        });
      }
    }

    var classDefinition = new MetadataClass({
      id: "classId",
      class: {
        properties: propertiesJson,
      },
      enums: enumDefinitions,
    });

    var properties = {};
    var bufferViews = {};
    var bufferViewIndex = 0;
    var count = 0;

    for (var propertyId in propertyValues) {
      if (propertyValues.hasOwnProperty(propertyId)) {
        var classProperty = classDefinition.properties[propertyId];
        var values = propertyValues[propertyId];
        count = values.length;

        var valuesBuffer = addPadding(
          createValuesBuffer(values, classProperty)
        );
        var valuesBufferView = bufferViewIndex++;
        bufferViews[valuesBufferView] = valuesBuffer;

        var property = {
          bufferView: valuesBufferView,
        };

        properties[propertyId] = property;

        if (defined(offsetType)) {
          property.offsetType = offsetType;
        }

        if (
          classProperty.type === MetadataType.ARRAY &&
          !defined(classProperty.componentCount)
        ) {
          var arrayOffsetBuffer = addPadding(
            createArrayOffsetBuffer(values, offsetType)
          );
          var arrayOffsetBufferView = bufferViewIndex++;
          bufferViews[arrayOffsetBufferView] = arrayOffsetBuffer;
          property.arrayOffsetBufferView = arrayOffsetBufferView;
        }

        if (
          classProperty.type === MetadataType.STRING ||
          classProperty.componentType === MetadataType.STRING
        ) {
          var stringOffsetBuffer = addPadding(
            createStringOffsetBuffer(values, offsetType)
          );
          var stringOffsetBufferView = bufferViewIndex++;
          bufferViews[stringOffsetBufferView] = stringOffsetBuffer;
          property.stringOffsetBufferView = stringOffsetBufferView;
        }
      }
    }

    if (disableBigIntSupport) {
      spyOn(FeatureDetection, "supportsBigInt").and.returnValue(false);
    }

    if (disableBigInt64ArraySupport) {
      spyOn(FeatureDetection, "supportsBigInt64Array").and.returnValue(false);
    }

    if (disableBigUint64ArraySupport) {
      spyOn(FeatureDetection, "supportsBigUint64Array").and.returnValue(false);
    }

    return new MetadataTable({
      count: count,
      properties: properties,
      class: classDefinition,
      bufferViews: bufferViews,
    });
  }

  it("creates metadata table with default values", function () {
    var metadataTable = new MetadataTable({
      count: 10,
    });

    expect(metadataTable.count).toBe(10);
    expect(metadataTable.properties).toEqual({});
    expect(metadataTable.class).toBeUndefined();
  });

  it("creates metadata table", function () {
    var properties = {
      height: {
        type: "FLOAT32",
      },
      name: {
        type: "STRING",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
      name: ["A", "B"],
    };

    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    var expectedPropertyNames = ["height", "name"];

    expect(metadataTable.count).toBe(2);
    expect(Object.keys(metadataTable.properties).sort()).toEqual(
      expectedPropertyNames
    );
    expect(Object.keys(metadataTable.class.properties).sort()).toEqual(
      expectedPropertyNames
    );
  });

  it("constructor throws without count", function () {
    expect(function () {
      return new MetadataTable({});
    }).toThrowDeveloperError();
  });

  it("constructor throws if count is less than 1", function () {
    expect(function () {
      return new MetadataTable({
        count: 0,
      });
    }).toThrowDeveloperError();
  });

  it("hasProperty returns false when there's no properties", function () {
    var metadataTable = createTable();
    expect(metadataTable.hasProperty("height")).toBe(false);
  });

  it("hasProperty returns false when there's no property with the given property ID", function () {
    var properties = {
      height: {
        type: "FLOAT32",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(metadataTable.hasProperty("color")).toBe(false);
  });

  it("hasProperty returns true when there's a property with the given property ID", function () {
    var properties = {
      height: {
        type: "FLOAT32",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(metadataTable.hasProperty("height")).toBe(true);
  });

  it("hasProperty returns true when the class has a default value for a missing property", function () {
    var properties = {
      height: {
        type: "FLOAT32",
        default: "10.0",
        optional: true,
      },
      name: {
        type: "STRING",
      },
    };
    var propertyValues = {
      name: ["A", "B"],
    };

    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(metadataTable.hasProperty("height")).toBe(true);
  });

  it("hasProperty throws without propertyId", function () {
    var metadataTable = createTable();

    expect(function () {
      metadataTable.hasProperty();
    }).toThrowDeveloperError();
  });

  it("getPropertyIds returns empty array when there are no properties", function () {
    var metadataTable = createTable();
    expect(metadataTable.getPropertyIds().length).toBe(0);
  });

  it("getPropertyIds returns array of property IDs", function () {
    var properties = {
      height: {
        type: "FLOAT32",
      },
      name: {
        type: "STRING",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
      name: ["A", "B"],
    };

    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(metadataTable.getPropertyIds().sort()).toEqual(["height", "name"]);
  });

  it("getPropertyIds includes properties with default values", function () {
    var properties = {
      height: {
        type: "FLOAT32",
        default: "10.0",
        optional: true,
      },
      name: {
        type: "STRING",
      },
    };
    var propertyValues = {
      name: ["A", "B"],
    };

    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(metadataTable.getPropertyIds().sort()).toEqual(["height", "name"]);
  });

  it("getPropertyIds uses results argument", function () {
    var properties = {
      height: {
        type: "FLOAT32",
      },
      name: {
        type: "STRING",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
      name: ["A", "B"],
    };

    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    var results = [];
    var returnedResults = metadataTable.getPropertyIds(results);

    expect(results).toBe(returnedResults);
    expect(results.sort()).toEqual(["height", "name"]);
  });

  it("getProperty returns undefined when there's no properties", function () {
    var metadataTable = new MetadataTable({
      count: 10,
    });
    expect(metadataTable.getProperty(0, "height")).toBeUndefined();
  });

  it("getProperty returns undefined when there's no property with the given property ID", function () {
    var properties = {
      height: {
        type: "FLOAT32",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(metadataTable.getProperty(0, "name")).toBeUndefined();
  });

  function testGetUint64(options) {
    if (
      !FeatureDetection.supportsBigUint64Array() ||
      !FeatureDetection.supportsBigInt()
    ) {
      return;
    }

    options = defaultValue(options, defaultValue.EMPTY_OBJECT);
    var disableBigIntSupport = options.disableBigIntSupport;
    var disableBigUint64ArraySupport = options.disableBigUint64ArraySupport;

    var originalValues = [
      BigInt(0), // eslint-disable-line
      BigInt(10), // eslint-disable-line
      BigInt("4611686018427387833"), // eslint-disable-line
      BigInt("18446744073709551615"), // eslint-disable-line
    ];

    var expectedValues = originalValues;

    if (disableBigUint64ArraySupport && disableBigIntSupport) {
      // Precision loss is expected if UINT64 is converted to JS numbers
      expectedValues = [0, 10, 4611686018427388000, 18446744073709552000];
    }

    var properties = {
      propertyUint64: {
        type: "UINT64",
      },
    };
    var propertyValues = {
      propertyUint64: originalValues,
    };

    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
      disableBigUint64ArraySupport: disableBigUint64ArraySupport,
      disableBigIntSupport: disableBigIntSupport,
    });

    var length = originalValues.length;
    for (var i = 0; i < length; ++i) {
      var value = metadataTable.getProperty(i, "propertyUint64");
      expect(value).toEqual(expectedValues[i]);
    }
  }

  function testGetInt64(options) {
    if (
      !FeatureDetection.supportsBigInt64Array() ||
      !FeatureDetection.supportsBigInt()
    ) {
      return;
    }

    options = defaultValue(options, defaultValue.EMPTY_OBJECT);
    var disableBigIntSupport = options.disableBigIntSupport;
    var disableBigInt64ArraySupport = options.disableBigInt64ArraySupport;

    var originalValues = [
      BigInt("-9223372036854775808"), // eslint-disable-line
      BigInt("-4611686018427387833"), // eslint-disable-line
      BigInt(-10), // eslint-disable-line
      BigInt(0), // eslint-disable-line
      BigInt(10), // eslint-disable-line
      BigInt("4611686018427387833"), // eslint-disable-line
      BigInt("9223372036854775807"), // eslint-disable-line
    ];

    var expectedValues = originalValues;

    if (disableBigInt64ArraySupport && disableBigIntSupport) {
      // Precision loss is expected if INT64 is converted to JS numbers
      expectedValues = [
        -9223372036854776000,
        -4611686018427388000,
        -10,
        0,
        10,
        4611686018427388000,
        9223372036854776000,
      ];
    }

    var properties = {
      propertyInt64: {
        type: "INT64",
      },
    };
    var propertyValues = {
      propertyInt64: originalValues,
    };

    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
      disableBigInt64ArraySupport: disableBigInt64ArraySupport,
      disableBigIntSupport: disableBigIntSupport,
    });

    var length = originalValues.length;
    for (var i = 0; i < length; ++i) {
      var value = metadataTable.getProperty(i, "propertyInt64");
      expect(value).toEqual(expectedValues[i]);
    }
  }

  it("getProperty returns UINT64 property as BigInt when BigUint64Array is supported and BigInt is supported", function () {
    testGetUint64();
  });

  it("getProperty returns UINT64 property as BigInt when BigUint64Array is not supported and BigInt is supported", function () {
    testGetUint64({
      disableBigUint64ArraySupport: true,
    });
  });

  it("getProperty returns UINT64 property as number when BigUint64Array is not supported and BigInt is not supported", function () {
    testGetUint64({
      disableBigUint64ArraySupport: true,
      disableBigIntSupport: true,
    });
  });

  it("getProperty returns INT64 property as BigInt when BigInt64Array is supported and BigInt is supported", function () {
    testGetInt64();
  });

  it("getProperty returns INT64 property as BigInt when BigInt64Array is not supported and BigInt is supported", function () {
    testGetInt64({
      disableBigInt64ArraySupport: true,
    });
  });

  it("getProperty returns INT64 property as number when BigInt64Array is not supported and BigInt is not supported", function () {
    testGetInt64({
      disableBigInt64ArraySupport: true,
      disableBigIntSupport: true,
    });
  });

  it("getProperty returns number for numeric properties", function () {
    var properties = {
      propertyInt8: {
        type: "INT8",
      },
      propertyUint8: {
        type: "UINT8",
      },
      propertyInt16: {
        type: "INT16",
      },
      propertyUint16: {
        type: "UINT16",
      },
      propertyInt32: {
        type: "INT32",
      },
      propertyUint32: {
        type: "UINT32",
      },
      propertyFloat32: {
        type: "FLOAT32",
      },
      propertyFloat64: {
        type: "FLOAT64",
      },
    };

    var propertyValues = {
      propertyInt8: [-128, -10, 0, 10, 127],
      propertyUint8: [0, 10, 20, 30, 255],
      propertyInt16: [-32768, -10, 0, 10, 32767],
      propertyUint16: [0, 10, 20, 30, 65535],
      propertyInt32: [-2147483648, -10, 0, 10, 2147483647],
      propertyUint32: [0, 10, 20, 30, 4294967295],
      propertyFloat32: [-2.5, -1.0, 0.0, 700.0, Number.POSITIVE_INFINITY],
      propertyFloat64: [-234934.12, -1.0, 0.0, 700.0, Number.POSITIVE_INFINITY],
    };

    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    for (var propertyId in propertyValues) {
      if (propertyValues.hasOwnProperty(propertyId)) {
        var expectedValues = propertyValues[propertyId];
        var length = expectedValues.length;
        for (var i = 0; i < length; ++i) {
          var value = metadataTable.getProperty(i, propertyId);
          expect(value).toEqual(expectedValues[i]);
        }
      }
    }
  });

  it("getProperty returns fixed size arrays", function () {
    if (
      !FeatureDetection.supportsBigInt64Array() ||
      !FeatureDetection.supportsBigInt()
    ) {
      return;
    }

    var enums = {
      myEnum: {
        values: [
          {
            value: 0,
            name: "ValueA",
          },
          {
            value: 1,
            name: "ValueB",
          },
          {
            value: -999,
            name: "Other",
          },
        ],
      },
    };

    var properties = {
      propertyInt8: {
        type: "ARRAY",
        componentType: "INT8",
        componentCount: 3,
      },
      propertyUint8: {
        type: "ARRAY",
        componentType: "UINT8",
        componentCount: 3,
      },
      propertyInt16: {
        type: "ARRAY",
        componentType: "INT16",
        componentCount: 3,
      },
      propertyUint16: {
        type: "ARRAY",
        componentType: "UINT16",
        componentCount: 3,
      },
      propertyInt32: {
        type: "ARRAY",
        componentType: "INT32",
        componentCount: 3,
      },
      propertyUint32: {
        type: "ARRAY",
        componentType: "UINT32",
        componentCount: 3,
      },
      propertyInt64: {
        type: "ARRAY",
        componentType: "INT64",
        componentCount: 3,
      },
      propertyUint64: {
        type: "ARRAY",
        componentType: "UINT64",
        componentCount: 3,
      },
      propertyFloat32: {
        type: "ARRAY",
        componentType: "FLOAT32",
        componentCount: 3,
      },
      propertyFloat64: {
        type: "ARRAY",
        componentType: "FLOAT64",
        componentCount: 3,
      },
      propertyBoolean: {
        type: "ARRAY",
        componentType: "BOOLEAN",
        componentCount: 3,
      },
      propertyString: {
        type: "ARRAY",
        componentType: "STRING",
        componentCount: 3,
      },
      propertyEnum: {
        type: "ARRAY",
        componentType: "ENUM",
        enumType: "myEnum",
        componentCount: 3,
      },
    };

    var propertyValues = {
      propertyInt8: [
        [-2, -1, 0],
        [1, 2, 3],
      ],
      propertyUint8: [
        [0, 1, 2],
        [3, 4, 5],
      ],
      propertyInt16: [
        [-2, -1, 0],
        [1, 2, 3],
      ],
      propertyUint16: [
        [0, 1, 2],
        [3, 4, 5],
      ],
      propertyInt32: [
        [-2, -1, 0],
        [1, 2, 3],
      ],
      propertyUint32: [
        [0, 1, 2],
        [3, 4, 5],
      ],
      propertyInt64: [
        [BigInt(-2), BigInt(-1), BigInt(0)], // eslint-disable-line
        [BigInt(1), BigInt(2), BigInt(3)], // eslint-disable-line
      ],
      propertyUint64: [
        [BigInt(0), BigInt(1), BigInt(2)], // eslint-disable-line
        [BigInt(3), BigInt(4), BigInt(5)], // eslint-disable-line
      ],
      propertyFloat32: [
        [-2.0, -1.0, 0.0],
        [1.0, 2.0, 3.0],
      ],
      propertyFloat64: [
        [-2.0, -1.0, 0.0],
        [1.0, 2.0, 3.0],
      ],
      propertyBoolean: [
        [false, true, false],
        [true, false, true],
      ],
      propertyString: [
        ["a", "bc", "def"],
        ["dog", "cat", "rat"],
      ],
      propertyEnum: [
        ["ValueA", "ValueB", "Other"],
        ["ValueA", "ValueA", "ValueA"],
      ],
    };

    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
      enums: enums,
    });

    for (var propertyId in propertyValues) {
      if (propertyValues.hasOwnProperty(propertyId)) {
        var expectedValues = propertyValues[propertyId];
        var length = expectedValues.length;
        for (var i = 0; i < length; ++i) {
          var value = metadataTable.getProperty(i, propertyId);
          expect(value).toEqual(expectedValues[i]);
        }
      }
    }
  });

  it("getProperty returns variable size arrays", function () {
    if (
      !FeatureDetection.supportsBigInt64Array() ||
      !FeatureDetection.supportsBigInt()
    ) {
      return;
    }

    var enums = {
      myEnum: {
        values: [
          {
            value: 0,
            name: "ValueA",
          },
          {
            value: 1,
            name: "ValueB",
          },
          {
            value: -999,
            name: "Other",
          },
        ],
      },
    };

    var properties = {
      propertyInt8: {
        type: "ARRAY",
        componentType: "INT8",
      },
      propertyUint8: {
        type: "ARRAY",
        componentType: "UINT8",
      },
      propertyInt16: {
        type: "ARRAY",
        componentType: "INT16",
      },
      propertyUint16: {
        type: "ARRAY",
        componentType: "UINT16",
      },
      propertyInt32: {
        type: "ARRAY",
        componentType: "INT32",
      },
      propertyUint32: {
        type: "ARRAY",
        componentType: "UINT32",
      },
      propertyInt64: {
        type: "ARRAY",
        componentType: "INT64",
      },
      propertyUint64: {
        type: "ARRAY",
        componentType: "UINT64",
      },
      propertyFloat32: {
        type: "ARRAY",
        componentType: "FLOAT32",
      },
      propertyFloat64: {
        type: "ARRAY",
        componentType: "FLOAT64",
      },
      propertyBoolean: {
        type: "ARRAY",
        componentType: "BOOLEAN",
      },
      propertyString: {
        type: "ARRAY",
        componentType: "STRING",
      },
      propertyEnum: {
        type: "ARRAY",
        componentType: "ENUM",
        enumType: "myEnum",
      },
    };

    var propertyValues = {
      propertyInt8: [[-2], [-1, 0], [1, 2, 3], []],
      propertyUint8: [[0], [1, 2], [3, 4, 5], []],
      propertyInt16: [[-2], [-1, 0], [1, 2, 3], []],
      propertyUint16: [[0], [1, 2], [3, 4, 5], []],
      propertyInt32: [[-2], [-1, 0], [1, 2, 3], []],
      propertyUint32: [[0], [1, 2], [3, 4, 5], []],
      propertyInt64: [
        [BigInt(-2)], // eslint-disable-line
        [BigInt(-1), BigInt(0)], // eslint-disable-line
        [BigInt(1), BigInt(2), BigInt(3)], // eslint-disable-line
        [],
      ],
      propertyUint64: [
        [BigInt(0)], // eslint-disable-line
        [BigInt(1), BigInt(2)], // eslint-disable-line
        [BigInt(3), BigInt(4), BigInt(5)], // eslint-disable-line
        [],
      ],
      propertyFloat32: [[-2.0], [-1.0, 0.0], [1.0, 2.0, 3.0], []],
      propertyFloat64: [[[-2.0], [-1.0, 0.0], [1.0, 2.0, 3.0], []]],
      propertyBoolean: [[false], [true, false], [true, false, true], []],
      propertyString: [["a"], ["bc", "def"], ["dog", "cat", "rat"], []],
      propertyEnum: [
        ["ValueA"],
        ["ValueB", "Other"],
        ["ValueA", "ValueA", "ValueA"],
        [],
      ],
    };

    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
      enums: enums,
    });

    for (var propertyId in propertyValues) {
      if (propertyValues.hasOwnProperty(propertyId)) {
        var expectedValues = propertyValues[propertyId];
        var length = expectedValues.length;
        for (var i = 0; i < length; ++i) {
          var value = metadataTable.getProperty(i, propertyId);
          expect(value).toEqual(expectedValues[i]);
        }
      }
    }
  });

  it("getProperty returns the default value when the property is missing", function () {
    var position = [0.0, 0.0, 0.0];

    var properties = {
      position: {
        type: "ARRAY",
        componentType: "FLOAT32",
        componentCount: 3,
        optional: true,
        default: position,
      },
      name: {
        type: "STRING",
      },
    };
    var propertyValues = {
      name: ["A", "B"],
    };

    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    var value = metadataTable.getProperty(0, "position");
    expect(value).toEqual(position);
    expect(value).not.toBe(position); // The value is cloned
  });

  it("getProperty throws without index", function () {
    var properties = {
      height: {
        type: "FLOAT32",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(function () {
      metadataTable.getProperty();
    }).toThrowDeveloperError();
  });

  it("getProperty throws without propertyId", function () {
    var properties = {
      height: {
        type: "FLOAT32",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(function () {
      metadataTable.getProperty(0);
    }).toThrowDeveloperError();
  });

  it("getProperty throws if index is out of bounds", function () {
    var properties = {
      height: {
        type: "FLOAT32",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(function () {
      metadataTable.getProperty(-1, "height");
    }).toThrowDeveloperError();

    expect(metadataTable.getProperty(0, "height")).toBe(1.0);
    expect(metadataTable.getProperty(1, "height")).toBe(2.0);

    expect(function () {
      metadataTable.getProperty(2, "height");
    }).toThrowDeveloperError();
  });

  // it("setProperty sets property value", function () {
  //   var buildingClass = new MetadataClass({
  //     id: "building",
  //     class: {
  //       properties: {
  //         position: {
  //           type: "ARRAY",
  //           componentType: "FLOAT32",
  //           componentCount: 3,
  //         },
  //       },
  //     },
  //   });
  //   var groupMetadata = new MetadataGroup({
  //     class: buildingClass,
  //     id: "building",
  //     group: {
  //       properties: {
  //         position: [0.0, 0.0, 0.0],
  //       },
  //     },
  //   });
  //   var position = [1.0, 1.0, 1.0];
  //   groupMetadata.setProperty("position", position);
  //   expect(groupMetadata.properties.position).toEqual(position);
  //   expect(groupMetadata.properties.position).not.toBe(position); // The value is cloned
  // });

  it("setProperty doesn't set property value when there's no class", function () {
    var metadataTable = new MetadataTable({
      count: 10,
    });

    metadataTable.setProperty(0, "name", "A");
    expect(metadataTable.getProperty(0, "name")).toBeUndefined();
  });

  it("setProperty doesn't set property value when there's no matching property ID", function () {
    var properties = {
      height: {
        type: "FLOAT32",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    metadataTable.setProperty(0, "name", "A");
    expect(metadataTable.getProperty(0, "name")).toBeUndefined();
  });

  it("setProperty throws without index", function () {
    var properties = {
      height: {
        type: "FLOAT32",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(function () {
      metadataTable.setProperty();
    }).toThrowDeveloperError();
  });

  it("setProperty throws without propertyId", function () {
    var properties = {
      height: {
        type: "FLOAT32",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(function () {
      metadataTable.setProperty(0);
    }).toThrowDeveloperError();
  });

  it("setProperty throws without value", function () {
    var properties = {
      height: {
        type: "FLOAT32",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(function () {
      metadataTable.setProperty(0, "height");
    }).toThrowDeveloperError();
  });

  it("setProperty throws if index is out of bounds", function () {
    var properties = {
      height: {
        type: "FLOAT32",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(function () {
      metadataTable.setProperty(-1, "height", 0.0);
    }).toThrowDeveloperError();

    metadataTable.setProperty(0, "height", 0.0);
    metadataTable.setProperty(1, "height", 0.0);

    expect(function () {
      metadataTable.setProperty(2, "height", 0.0);
    }).toThrowDeveloperError();
  });

  it("getPropertyBySemantic returns undefined when there's no class", function () {
    var metadataTable = new MetadataTable({
      count: 10,
    });
    expect(metadataTable.getPropertyBySemantic(0, "_HEIGHT")).toBeUndefined();
  });

  it("getPropertyBySemantic returns undefined when there's no property with the given semantic", function () {
    var properties = {
      height: {
        type: "FLOAT32",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(metadataTable.getPropertyBySemantic(0, "_HEIGHT")).toBeUndefined();
  });

  it("getPropertyBySemantic returns the property value", function () {
    var properties = {
      height: {
        type: "FLOAT32",
        semantic: "_HEIGHT",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(metadataTable.getPropertyBySemantic(0, "_HEIGHT")).toBe(1.0);
  });

  it("getPropertyBySemantic throws without index", function () {
    var properties = {
      height: {
        type: "FLOAT32",
        semantic: "_HEIGHT",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(function () {
      metadataTable.getPropertyBySemantic();
    }).toThrowDeveloperError();
  });

  it("getPropertyBySemantic throws without semantic", function () {
    var properties = {
      height: {
        type: "FLOAT32",
        semantic: "_HEIGHT",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(function () {
      metadataTable.getPropertyBySemantic(0);
    }).toThrowDeveloperError();
  });

  it("getPropertyBySemantic throws if index is out of bounds", function () {
    var properties = {
      height: {
        type: "FLOAT32",
        semantic: "_HEIGHT",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(function () {
      metadataTable.getPropertyBySemantic(-1, "_HEIGHT");
    }).toThrowDeveloperError();

    metadataTable.getPropertyBySemantic(0, "_HEIGHT");
    metadataTable.getPropertyBySemantic(1, "_HEIGHT");

    expect(function () {
      metadataTable.getPropertyBySemantic(2, "_HEIGHT");
    }).toThrowDeveloperError();
  });

  it("setPropertyBySemantic doesn't set property value when there's no class", function () {
    var metadataTable = new MetadataTable({
      count: 10,
    });

    metadataTable.setPropertyBySemantic(0, "_HEIGHT", 20.0);
    expect(metadataTable.getPropertyBySemantic(0, "_HEIGHT")).toBeUndefined();
  });

  it("setPropertyBySemantic doesn't set property value when there's no matching semantic", function () {
    var properties = {
      height: {
        type: "FLOAT32",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    metadataTable.setPropertyBySemantic(0, "_HEIGHT", 20.0);
    expect(metadataTable.getPropertyBySemantic(0, "_HEIGHT")).toBeUndefined();
  });

  it("setPropertyBySemantic sets property value", function () {
    var properties = {
      height: {
        type: "FLOAT32",
        semantic: "_HEIGHT",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    metadataTable.setPropertyBySemantic(0, "_HEIGHT", 20.0);
    expect(metadataTable.getPropertyBySemantic(0, "_HEIGHT")).toBe(20.0);
  });

  it("setPropertyBySemantic throws without index", function () {
    var properties = {
      height: {
        type: "FLOAT32",
        semantic: "_HEIGHT",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(function () {
      metadataTable.setPropertyBySemantic();
    }).toThrowDeveloperError();
  });

  it("setPropertyBySemantic throws without semantic", function () {
    var properties = {
      height: {
        type: "FLOAT32",
        semantic: "_HEIGHT",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(function () {
      metadataTable.setPropertyBySemantic(0);
    }).toThrowDeveloperError();
  });

  it("setPropertyBySemantic throws without value", function () {
    var properties = {
      height: {
        type: "FLOAT32",
        semantic: "_HEIGHT",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(function () {
      metadataTable.setPropertyBySemantic(0, "_HEIGHT");
    }).toThrowDeveloperError();
  });

  it("setPropertyBySemantic throws if index is out of bounds", function () {
    var properties = {
      height: {
        type: "FLOAT32",
        semantic: "_HEIGHT",
      },
    };
    var propertyValues = {
      height: [1.0, 2.0],
    };
    var metadataTable = createTable({
      properties: properties,
      propertyValues: propertyValues,
    });

    expect(function () {
      metadataTable.setPropertyBySemantic(-1, "_HEIGHT", 0.0);
    }).toThrowDeveloperError();

    metadataTable.setPropertyBySemantic(0, "_HEIGHT", 0.0);
    metadataTable.setPropertyBySemantic(1, "_HEIGHT", 0.0);

    expect(function () {
      metadataTable.setPropertyBySemantic(2, "_HEIGHT", 0.0);
    }).toThrowDeveloperError();
  });
});
