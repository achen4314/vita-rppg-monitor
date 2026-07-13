package io.vita.rppg

import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.metadata.Metadata
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "VitaHealth")
class VitaHealthPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val permissions =
        setOf(
            HealthPermission.getWritePermission(HeartRateRecord::class),
            HealthPermission.getWritePermission(HeartRateVariabilityRmssdRecord::class),
            HealthPermission.getWritePermission(RespiratoryRateRecord::class),
        )
    private lateinit var permissionLauncher: ActivityResultLauncher<Set<String>>
    private var pendingPermissionCall: PluginCall? = null

    override fun load() {
        permissionLauncher =
            activity.registerForActivityResult(
                PermissionController.createRequestPermissionResultContract()
            ) { granted ->
                pendingPermissionCall?.let { call ->
                    call.resolve(statusPayload(granted))
                    pendingPermissionCall = null
                }
            }
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val sdkStatus = HealthConnectClient.getSdkStatus(context)
        if (sdkStatus != HealthConnectClient.SDK_AVAILABLE) {
            call.resolve(statusPayload(emptySet(), sdkStatus))
            return
        }

        scope.launch {
            try {
                val granted = client().permissionController.getGrantedPermissions()
                resolveOnMain(call, statusPayload(granted, sdkStatus))
            } catch (error: Exception) {
                rejectOnMain(call, error)
            }
        }
    }

    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        val sdkStatus = HealthConnectClient.getSdkStatus(context)
        if (sdkStatus != HealthConnectClient.SDK_AVAILABLE) {
            call.resolve(statusPayload(emptySet(), sdkStatus))
            return
        }

        pendingPermissionCall?.reject("已有健康权限请求正在进行")
        pendingPermissionCall = call
        permissionLauncher.launch(permissions)
    }

    @PluginMethod
    fun writeMeasurement(call: PluginCall) {
        val bpm = call.getDouble("bpm")
        val timestamp = call.getLong("timestamp") ?: System.currentTimeMillis()
        val rmssd = call.getDouble("rmssd")
        val respiratoryRate = call.getDouble("respiratoryRate")

        if (bpm == null || bpm < 30.0 || bpm > 240.0) {
            call.reject("缺少有效心率数据")
            return
        }

        scope.launch {
            try {
                val healthClient = client()
                val granted = healthClient.permissionController.getGrantedPermissions()
                if (!granted.containsAll(permissions)) {
                    throw IllegalStateException("尚未授予 Health Connect 写入权限")
                }

                val time = Instant.ofEpochMilli(timestamp)
                val zoneOffset = ZoneId.systemDefault().rules.getOffset(time)
                val records = mutableListOf<Record>()
                records +=
                    HeartRateRecord(
                        startTime = time.minusSeconds(1),
                        startZoneOffset = zoneOffset,
                        endTime = time,
                        endZoneOffset = zoneOffset,
                        samples = listOf(HeartRateRecord.Sample(time, bpm.toLong())),
                        metadata = Metadata.manualEntry(),
                    )

                if (rmssd != null && rmssd in 1.0..200.0) {
                    records +=
                        HeartRateVariabilityRmssdRecord(
                            time = time,
                            zoneOffset = zoneOffset,
                            heartRateVariabilityMillis = rmssd,
                            metadata = Metadata.manualEntry(),
                        )
                }

                if (respiratoryRate != null && respiratoryRate in 1.0..100.0) {
                    records +=
                        RespiratoryRateRecord(
                            time = time,
                            zoneOffset = zoneOffset,
                            rate = respiratoryRate,
                            metadata = Metadata.manualEntry(),
                        )
                }

                healthClient.insertRecords(records)
                resolveOnMain(call, JSObject().apply { put("written", records.size) })
            } catch (error: Exception) {
                rejectOnMain(call, error)
            }
        }
    }

    private fun client(): HealthConnectClient = HealthConnectClient.getOrCreate(context)

    private fun statusPayload(
        granted: Set<String>,
        sdkStatus: Int = HealthConnectClient.SDK_AVAILABLE,
    ): JSObject =
        JSObject().apply {
            put("available", sdkStatus == HealthConnectClient.SDK_AVAILABLE)
            put("needsProviderUpdate", sdkStatus == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED)
            put("authorized", granted.containsAll(permissions))
            put("grantedCount", granted.intersect(permissions).size)
            put("requiredCount", permissions.size)
        }

    private fun resolveOnMain(call: PluginCall, payload: JSObject) {
        activity.runOnUiThread { call.resolve(payload) }
    }

    private fun rejectOnMain(call: PluginCall, error: Exception) {
        activity.runOnUiThread { call.reject(error.message ?: "Health Connect 操作失败", error) }
    }
}
