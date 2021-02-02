import { defined } from "../../Source/Cesium.js";
import { defaultValue } from "../../Source/Cesium.js";
import { MetadataClass } from "../../Source/Cesium.js";
import { MetadataOffsetType } from "../../Source/Cesium.js";
import { MetadataTable } from "../../Source/Cesium.js";
import { MetadataType } from "../../Source/Cesium.js";
import MetadataComponentType from "../../Source/Scene/MetadataComponentType.js";

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
    var flattenedValues = [].concat.apply([], values);
    var typedArray;

    switch (type) {
      case MetadataType.INT8:
        typedArray = new Int8Array(flattenedValues);
        break;
      case MetadataType.UINT8:
        typedArray = new Uint8Array(flattenedValues);
        break;
      case MetadataType.INT16:
        typedArray = new Int16Array(flattenedValues);
        break;
      case MetadataType.UINT16:
        typedArray = new Uint16Array(flattenedValues);
        break;
      case MetadataType.INT32:
        typedArray = new Int32Array(flattenedValues);
        break;
      case MetadataType.UINT32:
        typedArray = new Uint32Array(flattenedValues);
        break;
      case MetadataType.INT64:
        typedArray = new BigInt64Array(flattenedValues); // eslint-disable-line
        break;
      case MetadataType.UINT64:
        typedArray = new BigUint64Array(flattenedValues); // eslint-disable-line
        break;
      case MetadataType.FLOAT32:
        typedArray = new Float32Array(flattenedValues);
        break;
      case MetadataType.FLOAT64:
        typedArray = new Float64Array(flattenedValues);
        break;
      case MetadataType.STRING:
        var encoder = new TextEncoder();
        typedArray = encoder.encode(flattenedValues.join(""));
        break;
      case MetadataType.BOOLEAN:
        var length = Math.ceil(flattenedValues.length / 8);
        typedArray = new Uint8Array(length); // Initialized as 0's
        for (var i = 0; i < flattenedValues.length; ++i) {
          var byteIndex = i >> 3;
          var bitIndex = i % 8;
          if (flattenedValues[i]) {
            typedArray[byteIndex] |= 1 << bitIndex;
          }
        }
        break;
    }

    return new Uint8Array(typedArray.buffer);
  }

  function getValueType(classProperty) {
    var type = classProperty.type;
    var componentType = classProperty.componentType;
    var enumType = classProperty.enumType;

    if (type === MetadataType.ARRAY) {
      type = componentType;
    }
    if (type === MetadataType.ENUM) {
      type = enumType;
    }

    return type;
  }

  function createValuesBuffer(values, classProperty) {
    var type = getValueType(classProperty);
    return createBuffer(values, type);
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
    offsetType = defaultValue(offsetType, MetadataOffsetType.UINT32);
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
    offsetType = defaultValue(offsetType, MetadataOffsetType.UINT32);
    return createBuffer(offsets, offsetType);
  }

  function addPadding(uint8Array) {
    // This tests that MetadataTable uses the Uint8Array's byteOffset properly
    var paddingBytes = 8;
    var padded = new Uint8Array(paddingBytes + uint8Array.length);
    padded.set(uint8Array, paddingBytes);
    return new Uint8Array(padded.buffer, paddingBytes, uint8Array.length);
  }

  function createTable(propertiesJson, propertyValues, offsetType) {
    var classDefinition = new MetadataClass({
      id: "classId",
      class: {
        properties: propertiesJson,
      },
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
          classProperty.componentType === MetadataComponentType.STRING
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

    var metadataTable = createTable(properties, propertyValues);

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
    var buildingClass = new MetadataClass({
      id: "building",
      class: {},
    });

    expect(function () {
      return new MetadataTable({
        properties: {},
        class: buildingClass,
        bufferViews: {},
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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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

    var metadataTable = createTable(properties, propertyValues);

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

    var metadataTable = createTable(properties, propertyValues);

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

    var metadataTable = createTable(properties, propertyValues);

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

    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

    expect(metadataTable.getProperty(0, "name")).toBeUndefined();
  });

  // it("getProperty returns the property value", function () {
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
  //   var position = [0.0, 0.0, 0.0];
  //   var groupMetadata = new MetadataGroup({
  //     class: buildingClass,
  //     id: "building",
  //     group: {
  //       properties: {
  //         position: position,
  //       },
  //     },
  //   });
  //   var value = groupMetadata.getProperty("position");
  //   expect(value).toEqual(position);
  //   expect(value).not.toBe(position); // The value is cloned
  // });

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

    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
    var metadataTable = createTable(properties, propertyValues);

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
