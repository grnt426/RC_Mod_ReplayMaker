import assert from 'assert';
import {HistoryManager, History, HistoryVersionUpgrader, DUMMY_BETA_VERSION} from "../../HistoryManager.mjs";
import fs from "fs";
import structuredClone from "realistic-structured-clone";

describe("HistoryManager", function() {

    // HistoryManager instance under test
    let man = undefined;

    // HistoryVersionUpgrader instance under test
    let histUp = undefined;

    const testRootDir = "test/snapshots/";

    // Does not exist on the filesystem
    const MISSING_INSTANCE = 11;

    // Contains the bare minimum to count as a history instance.
    const EMPTY_INSTANCE = 10;
    const EMPTY_INSTANCE_PATH = testRootDir + EMPTY_INSTANCE + "/history.json";
    const EMPTY_HISTORY = new History(EMPTY_INSTANCE);
    EMPTY_HISTORY.start = "2022-03-24T10:01:50.085-04:00";
    EMPTY_HISTORY.currentTimestamp = "2022-03-24T10:01:50.085-04:00";

    // Creates a simple starting history file with one system in one sector
    const SIMPLE_INSTANCE = 20;
    const SIMPLE_INSTANCE_PATH = testRootDir + SIMPLE_INSTANCE + "/history.json";
    const SIMPLE_SECTOR = {
        "id":0,
        "name":"simple sector",
        "owner":null,
        "division":[{"faction":null, points:1}],
    };
    const SIMPLE_SYSTEM = {
        "id": 1,
        "name":"system name",
        "owner":null,
        "sector_id": 0,
        "status":"uninhabited"
    };
    const SIMPLE_HISTORY = new History(
        SIMPLE_INSTANCE, {stellar_systems:[SIMPLE_SYSTEM],sectors:[SIMPLE_SECTOR]}
    );
    SIMPLE_HISTORY.start = "2022-03-24T10:01:50.085-04:00";
    SIMPLE_HISTORY.currentTimestamp = "2022-03-24T10:01:50.085-04:00";

    const EMPTY_BETA_HISTORY = {
        snapshots:[{}]
    }

    beforeEach(function() {

        fs.writeFileSync(EMPTY_INSTANCE_PATH, JSON.stringify(EMPTY_HISTORY), err => {
            if (err) {
                throw err;
            }
        });

        fs.writeFileSync(SIMPLE_INSTANCE_PATH, JSON.stringify(SIMPLE_HISTORY), err => {
            if (err) {
                throw err;
            }
        });

        man = new HistoryManager(testRootDir);
        histUp = new HistoryVersionUpgrader();
    });

    describe("#HistoryUpgrades", function() {
        describe("versionTesting", function() {
            it("given empty detect no version", function() {
                let emptyJson = JSON.stringify({});
                assert(!histUp.isAlphaVersion(emptyJson));
                assert(!histUp.isBetaVersion(emptyJson));
                assert(!histUp.detectVersion(emptyJson));
            });

            it("given beta version detect beta", function() {
                let emptyBetaHistory = JSON.stringify(EMPTY_BETA_HISTORY);
                assert(!histUp.isAlphaVersion(emptyBetaHistory));
                assert(histUp.isBetaVersion(emptyBetaHistory));
                assert.equal(histUp.detectVersion(emptyBetaHistory), DUMMY_BETA_VERSION, "Should detect Beta");
            });

            it("detect version 1", function() {
                let simpleJson = JSON.stringify(SIMPLE_HISTORY);
                assert(!histUp.isAlphaVersion(simpleJson));
                assert(!histUp.isBetaVersion(simpleJson));
                assert.equal(histUp.detectVersion(simpleJson), 1, "Should detect version 1");
            });

            it("should return true for upgrade when given beta", function() {
                let emptyBetaHistory = JSON.stringify(EMPTY_BETA_HISTORY);
                assert(histUp.shouldUpgradeHistory(emptyBetaHistory));
            });

            it("should return true for upgrade when given version 0.5", function() {
                let version05History = JSON.stringify({VERSION:0.5});
                assert(histUp.shouldUpgradeHistory(version05History));
            });
        });
    });

    describe("#getHistory", function() {

        it("should load history from disk", function() {
            const history = man.getHistory(EMPTY_INSTANCE);
            assert.notEqual(history, null, "Should not be null or undefined.");
            assert.deepStrictEqual(history, EMPTY_HISTORY);
        });

        it("should return history that was loaded previously", function() {
            const history = man.getHistory(EMPTY_INSTANCE);
            assert.notEqual(history, null, "Should not be null or undefined.");
            assert.deepStrictEqual(history, EMPTY_HISTORY);

            const historyAgain = man.getHistory(EMPTY_INSTANCE);
            assert.notEqual(historyAgain, null, "Should not be null or undefined.");
            assert.deepStrictEqual(historyAgain, EMPTY_HISTORY);
        });

        it("should throw an exception if no history", function() {
            assert.throws(
                () => man.getHistory(MISSING_INSTANCE),
                /Failed to load history for 11. Cause: Could not find 'test\/snapshots\/11\/history.json'/
            );
        });

        it("testHistoryJsonConversionToObjectInstance", () => {
            let h = new History(123, {stellar_systems:[SIMPLE_SYSTEM],sectors:[SIMPLE_SECTOR]});
            fs.writeFileSync(testRootDir + 123 + "/history.json", JSON.stringify(h), err => {
                if (err) {
                    throw err;
                }
            });

            let data = readAndParse(testRootDir + 123 + "/history.json");
            let historyObj = Object.assign(new History, data);
            assert.equal(historyObj.getVersion(), 1, "Failed version match");
        });
    });

    describe("#applySystemUpdate", function() {
        it("should throw an exception if system not in current", function(){
            assert.throws(
                () => man.applySystemUpdate(SIMPLE_SYSTEM, EMPTY_INSTANCE),
                /Null system ID: 1 from instance 10/
            );
        });

        it("should update owner when it changes", function(){
            const newSys = structuredClone(SIMPLE_SYSTEM);
            newSys.owner = "new owner";

            mockGetSector(man, SIMPLE_HISTORY);

            man.applySystemUpdate(newSys, SIMPLE_INSTANCE);
            const res = readAndParse(SIMPLE_INSTANCE_PATH);
            assertSnapshotLengths(res, 1, 1);

            assert.strictEqual(res.snapshots[0].system.owner, newSys.owner, "Owner should be new one");

            assert.strictEqual(res.undo[0].system.owner, SIMPLE_SYSTEM.owner, "Owner should be new previous");

            assert.strictEqual(res.current.stellar_systems[0].owner, newSys.owner,
                "Current state should reflect changes.");
            assert.strictEqual(res.base.stellar_systems[0].owner, null,
                "Base state should still be null.");
        });

        it("should not update with no changes", function(){
            man.applySystemUpdate(SIMPLE_SYSTEM, SIMPLE_INSTANCE);
            const res = readAndParse(SIMPLE_INSTANCE_PATH);
            assert.notEqual(res, null, "Should not be null.");
            assert.equal(res.snapshots.length, 0, "Should not have a snap record.");
            assert.equal(res.undo.length, 0, "Should not have an undo record.");

            assert.strictEqual(res.current.stellar_systems[0].owner, null,
                "Current state should still be null for owner.");
            assert.strictEqual(res.base.stellar_systems[0].owner, null,
                "Base state should still be null.");
        });

        it("should not write unneeded information", function(){
            const newSys = structuredClone(SIMPLE_SYSTEM);
            newSys.position = "not needed";
            newSys.score = "not needed";
            newSys.receivedAt = "not needed";
            newSys.owner = "new owner";

            mockGetSector(man, SIMPLE_HISTORY);

            man.applySystemUpdate(newSys, SIMPLE_INSTANCE);
            const res = readAndParse(SIMPLE_INSTANCE_PATH);
            assertSnapshotLengths(res, 1, 1);

            let snap = res.snapshots[0];
            let usnap = res.undo[0];

            assert.strictEqual(snap.system.owner, newSys.owner, "Owner should be new one");
            assert.strictEqual(usnap.system.owner, SIMPLE_SYSTEM.owner, "Owner should be new previous");

            assert.equal(res.current.stellar_systems[0].position, null, "Shouldn't have this.");
            assert.equal(res.current.stellar_systems[0].score, null, "Shouldn't have this.");
            assert.equal(res.current.stellar_systems[0].receivedAt, null, "Shouldn't have this.");
            assert.equal(snap.system.position, null, "Shouldn't have this.");
            assert.equal(snap.system.score, null, "Shouldn't have this.");
            assert.equal(snap.system.receivedAt, null, "Shouldn't have this.");
            assert.equal(usnap.position, null, "Shouldn't have this.");
            assert.equal(usnap.score, null, "Shouldn't have this.");
            assert.equal(usnap.receivedAt, null, "Shouldn't have this.");

            assert.strictEqual(res.current.stellar_systems[0].owner, newSys.owner,
                "Current state should reflect changes.");
            assert.strictEqual(res.base.stellar_systems[0].owner, null,
                "Base state should still be null.");
        });
    });
});

/**
 * The `getSector` of HistoryManager normally calls the global `window` object to retrieve the current
 * actual state of the galaxy for the sector information. We need to mock it as the global `window`
 * wouldn't otherwise be available.
 */
function mockGetSector(man, source) {
    man.getSector = function(id) {
        return source.current.sectors[id];
    }
}

function assertSnapshotLengths(history, snapshotsLen, undoLen) {
    assert.notEqual(history, null, "History shouldn't be null.");
    assert.notEqual(history, {}, "History shouldn't be an empty object.");
    assert.equal(history.snapshots.length, snapshotsLen, "Should have a snap record.");
    assert.equal(history.undo.length, undoLen, "Should have an undo record.");
}

function readAndParse(file) {
    const res = fs.readFileSync(file, 'utf8');
    assert.notEqual(res, null, "File shouldn't be empty");
    return JSON.parse(res);
}